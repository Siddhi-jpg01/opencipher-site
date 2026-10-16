"""
OpenCipher API + website.

Run from the backend/ folder:
    uvicorn app.main:app --reload
then open http://localhost:8000
"""
import asyncio
import time
import traceback
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import analyzer, config, github, llm, prompts
from .store import LocalStore, make_store

app = FastAPI(title="OpenCipher", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

store = make_store()
JOBS: dict[str, dict] = {}

STAGES = ["meta", "readme", "tree", "deps", "contributing", "issues", "ai_overview", "ai_map", "ai_practice", "save"]


@app.on_event("startup")
async def check_store():
    global store
    if store.kind == "MongoDB Atlas":
        try:
            await store.db.command("ping")
            print("[store] Connected to MongoDB Atlas")
        except Exception as e:
            print(f"[store] Can't reach MongoDB ({e.__class__.__name__}); using local files in backend/data instead.")
            store = LocalStore()
    else:
        print("[store] Saving to local files in backend/data (set MONGODB_URI to use MongoDB Atlas)")
    h = await llm.health()
    print(f"[ai] {h['provider']} / {h['model']}: {'ready' if h['reachable'] else 'NOT READY - ' + h['detail']}")


# ---------------------------------------------------------------- models
class AnalyzeIn(BaseModel):
    repo: str = Field(..., max_length=300)
    level: str = "beginner"
    refresh: bool = False


class AskIn(BaseModel):
    guide_id: str
    question: str = Field(..., min_length=1, max_length=600)
    history: list[dict] = []


class ProgressIn(BaseModel):
    user_id: str = Field(..., max_length=64)
    guide_id: str = Field(..., max_length=200)
    data: dict


# ---------------------------------------------------------------- routes
@app.get("/api/health")
async def health():
    return {"ok": True, "ai": await llm.health(), "store": store.kind, "model": config.MODEL_DISPLAY_NAME,
            "github_token": bool(config.GITHUB_TOKEN)}


@app.post("/api/analyze")
async def analyze(body: AnalyzeIn):
    try:
        owner, name = github.parse_repo(body.repo)
    except github.GitHubError as e:
        raise HTTPException(e.status, e.message)
    level = body.level if body.level in prompts.LEVELS else "beginner"
    gid = analyzer.guide_id(owner, name)

    if not body.refresh:
        doc = await store.get_guide(gid)
        if doc and time.time() - doc.get("saved_at", 0) < config.CACHE_HOURS * 3600 and doc["guide"].get("ai") != "none":
            return {"status": "done", "guide_id": gid, "cached": True}

    running = next((jid for jid, j in JOBS.items() if j["guide_id"] == gid and j["status"] == "running"), None)
    if running:
        return {"status": "running", "job_id": running}

    jid = uuid.uuid4().hex[:12]
    JOBS[jid] = {"status": "running", "stage": "meta", "done": [], "guide_id": gid, "error": None,
                 "repo": f"{owner}/{name}", "started": time.time(), "ai": None}
    asyncio.create_task(_run_job(jid, owner, name, level))
    return {"status": "running", "job_id": jid}


async def _run_job(jid: str, owner: str, name: str, level: str):
    job = JOBS[jid]

    async def progress(stage: str):
        if job["stage"] != stage:
            job["done"].append(job["stage"])
        job["stage"] = stage

    try:
        bundle = await github.fetch_bundle(owner, name, progress)
        h = await llm.health()
        job["ai"] = h["reachable"]
        guide, context = await analyzer.build_guide(bundle, level, progress, use_ai=h["reachable"])
        if not h["reachable"]:
            guide["ai_notes"] = [h["detail"] or "The AI model isn't running."]
        await progress("save")
        await store.save_guide(guide, context)
        job.update(status="done", guide_id=guide["id"])
        job["done"].append("save")
    except github.GitHubError as e:
        job.update(status="error", error=e.message)
    except Exception as e:  # never leave the browser waiting forever
        traceback.print_exc()
        job.update(status="error", error=f"Something went wrong while reading the repository ({e.__class__.__name__}). Try again.")
    # forget old jobs after 30 minutes
    for k in [k for k, j in JOBS.items() if time.time() - j["started"] > 1800]:
        JOBS.pop(k, None)


@app.get("/api/jobs/{jid}")
async def job_status(jid: str):
    job = JOBS.get(jid)
    if not job:
        raise HTTPException(404, "That job has expired. Start the analysis again.")
    return {k: job[k] for k in ("status", "stage", "done", "guide_id", "error", "repo", "ai")} | {"stages": STAGES}


@app.get("/api/guides")
async def recent_guides():
    return await store.recent()


@app.get("/api/guides/{gid}")
async def get_guide(gid: str):
    doc = await store.get_guide(gid)
    if not doc:
        raise HTTPException(404, "We couldn't find that guide. Build it again from the home page.")
    return doc["guide"]


@app.post("/api/ask")
async def ask(body: AskIn):
    doc = await store.get_guide(body.guide_id)
    if not doc:
        raise HTTPException(404, "Guide not found.")
    guide, context = doc["guide"], doc.get("context", {})
    h = await llm.health()
    if not h["reachable"]:
        return {"answer": analyzer.keyword_answer(body.question, guide, context), "ai": False}
    history = [{"role": m.get("role"), "content": str(m.get("content", ""))[:800]}
               for m in body.history[-6:] if m.get("role") in ("user", "assistant")]
    try:
        answer = await llm.complete_text(prompts.chat_system(guide, context),
                                         history + [{"role": "user", "content": body.question}])
    except llm.LLMError as e:
        return {"answer": f"{e} " + analyzer.keyword_answer(body.question, guide, context), "ai": False}
    return {"answer": answer, "ai": True}


@app.get("/api/progress/{user_id}/{gid}")
async def get_progress(user_id: str, gid: str):
    return await store.get_progress(user_id, gid) or {}


@app.post("/api/progress")
async def save_progress(body: ProgressIn):
    allowed = {k: body.data[k] for k in ("checks", "visited", "xp", "awarded", "bestScore", "best", "streak", "lastDay", "badges") if k in body.data}
    await store.save_progress(body.user_id, body.guide_id, allowed)
    return {"ok": True}


# ---------------------------------------------------------------- website
# Served last so /api/* routes win. Opening http://localhost:8000 shows the site.
if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="site")
