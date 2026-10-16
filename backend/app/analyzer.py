"""
Turns a GitHub bundle into a finished guide.

  1. heuristics.basic_guide()  -> a complete guide from data alone
  2. three model calls          -> better, plain-language versions of each section
  3. normalise_*()              -> every model answer is checked against the real repo;
                                   anything invalid is dropped and the basic version kept
"""
import re
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

from . import config, heuristics, llm, prompts

Progress = Callable[[str], Awaitable[None]]


# ---------------------------------------------------------------- small validators
def _s(v, max_len: int = 600) -> str:
    if not isinstance(v, str):
        v = "" if v is None else str(v)
    v = " ".join(v.split()) if "\n" not in v else v.strip()
    return v[:max_len]


def _list(v) -> list:
    return v if isinstance(v, list) else []


def _int(v) -> Optional[int]:
    try:
        return int(str(v).lstrip("#"))
    except (TypeError, ValueError):
        return None


def _path_set(bundle: dict) -> set:
    s = set()
    for t in bundle.get("tree", []):
        s.add(t["path"])
        if t["type"] == "tree":
            s.add(t["path"] + "/")
    return s


def _match_path(p: str, paths: set) -> Optional[str]:
    p = re.sub(r"^(\./|/)+", "", _s(p, 300).strip())
    bare = p.rstrip("/")
    if bare + "/" in paths:          # it's a folder: always show it with a trailing slash
        return bare + "/"
    if bare in paths:
        return bare
    return None


# ---------------------------------------------------------------- normalisers
def normalise_overview(ai: dict, base: dict) -> dict:
    out = {}
    one = _s(ai.get("one_liner"), 300)
    paras = [_s(p, 700) for p in _list(ai.get("plain_explanation")) if _s(p)]
    if isinstance(ai.get("plain_explanation"), str):
        paras = [p.strip() for p in ai["plain_explanation"].split("\n") if p.strip()]
    if one and paras:
        out["summary"] = {"one_liner": one, "plain_explanation": paras[:4],
                          "who_its_for": _s(ai.get("who_its_for"), 300) or base["summary"]["who_its_for"],
                          "tech_stack": [_s(t, 40) for t in _list(ai.get("tech_stack")) if _s(t)][:8] or base["summary"]["tech_stack"]}
    pre = [{"name": _s(p.get("name"), 60), "why": _s(p.get("why"), 200), "link": _s(p.get("link"), 200)}
           for p in _list(ai.get("prerequisites")) if isinstance(p, dict) and _s(p.get("name"))]
    for p in pre:
        if not p["link"].startswith("http"):
            p["link"] = ""
    if len(pre) >= 2:
        out["prerequisites"] = pre[:6]
    steps = []
    for s in _list(ai.get("setup_steps")):
        if not isinstance(s, dict) or not _s(s.get("title")):
            continue
        cmd = s.get("command") or ""
        if isinstance(cmd, list):
            cmd = "\n".join(str(c) for c in cmd)
        cmd = re.sub(r"^\s*\$\s?", "", str(cmd), flags=re.M).strip()[:500]
        steps.append({"title": _s(s["title"], 80), "detail": _s(s.get("detail"), 300), "command": cmd})
    if len(steps) >= 3:
        out["setup_steps"] = steps[:8]
    gl = [{"term": _s(g.get("term"), 40), "meaning": _s(g.get("meaning"), 220)}
          for g in _list(ai.get("glossary")) if isinstance(g, dict) and _s(g.get("term")) and _s(g.get("meaning"))]
    if len(gl) >= 4:
        # keep the basic git terms too, AI terms first
        seen = {g["term"].lower() for g in gl}
        out["glossary"] = (gl + [g for g in base["glossary"] if g["term"].lower() not in seen])[:14]
    rules = [_s(r, 240) for r in _list(ai.get("contributing_rules")) if _s(r)]
    if len(rules) >= 2:
        out["contributing_rules"] = rules[:6]
    return out


def normalise_map(ai: dict, base: dict, bundle: dict) -> dict:
    out, paths = {}, _path_set(bundle)
    dirs, seen = [], set()
    for d in _list(ai.get("directories")):
        if not isinstance(d, dict):
            continue
        p = _match_path(d.get("path", ""), paths)
        if not p or p in seen:
            continue
        seen.add(p)
        imp = _s(d.get("importance")).lower()
        dirs.append({"path": p, "role": _s(d.get("role"), 240) or "Part of the project.",
                     "importance": imp if imp in ("core", "useful", "skip") else "useful",
                     "start_here": bool(d.get("start_here"))})
    if len(dirs) >= 4:
        starts = [d for d in dirs if d["start_here"]]
        for d in dirs:
            d["start_here"] = False
        (starts[0] if starts else next((d for d in dirs if d["importance"] == "core"), dirs[0]))["start_here"] = True
        out["directories"] = dirs[:14]

    gh = {i["number"]: i for i in bundle.get("issues", [])}
    base_by_no = {i["number"]: i for i in base["issues"]}
    iss = []
    for i in _list(ai.get("issues")):
        if not isinstance(i, dict):
            continue
        n = _int(i.get("number"))
        if n not in gh or any(x["number"] == n for x in iss):
            continue
        src, fallback = gh[n], base_by_no.get(n, {})
        diff = _s(i.get("difficulty")).lower()
        skills = [s for s in (_s(x).lower() for x in _list(i.get("skills"))) if s in heuristics.SKILLS]
        related = [p for p in (_match_path(x, paths) for x in _list(i.get("related_files"))) if p][:4]
        iss.append({
            "number": n, "title": src["title"], "url": src["url"], "labels": src.get("labels", [])[:4],
            "difficulty": diff if diff in ("easy", "medium", "hard") else fallback.get("difficulty", "medium"),
            "skills": skills or fallback.get("skills", []),
            "explanation": _s(i.get("explanation"), 400) or fallback.get("explanation", ""),
            "related_files": related or fallback.get("related_files", []),
            "estimated_time": _s(i.get("estimated_time"), 40) or fallback.get("estimated_time", ""),
        })
    if iss:
        # keep any GitHub issues the model skipped, after the ones it explained
        out["issues"] = iss + [b for b in base["issues"] if b["number"] not in {x["number"] for x in iss}][:max(0, 8 - len(iss))]
    fc = ai.get("first_contribution") if isinstance(ai.get("first_contribution"), dict) else {}
    n = _int(fc.get("issue_number"))
    pool = out.get("issues", base["issues"])
    hit = next((i for i in pool if i["number"] == n), None)
    if hit:
        out["first_contribution"] = {"issue_number": n, "title": hit["title"],
                                     "why": _s(fc.get("why"), 400) or base["first_contribution"]["why"]}
    return out


def _norm_question(q: dict) -> Optional[dict]:
    if not isinstance(q, dict):
        return None
    t = _s(q.get("type")).lower().replace("-", "").replace("_", "")
    t = {"truefalse": "truefalse", "tf": "truefalse", "fill": "fill", "fillintheblank": "fill", "fillblank": "fill"}.get(t, "mcq")
    question = _s(q.get("question"), 300)
    opts = [_s(o, 160) for o in _list(q.get("options")) if _s(o)]
    if t == "truefalse":
        opts = ["True", "False"]
    ans = q.get("answer")
    if isinstance(ans, bool):
        ans = 0 if ans else 1
    if isinstance(ans, str) and not ans.strip().isdigit():
        low = [o.lower() for o in opts]
        ans = low.index(ans.strip().lower()) if ans.strip().lower() in low else None
    ans = _int(ans)
    if not question or len(opts) < 2 or ans is None or not 0 <= ans < len(opts) or len(set(opts)) != len(opts):
        return None
    if t == "fill" and "____" not in question:
        question = re.sub(r"_{2,}", "____", question)
        if "____" not in question:
            t = "mcq"
    return {"type": t, "question": question, "options": opts[:4] if ans < 4 else opts,
            "answer": ans, "explanation": _s(q.get("explanation"), 300)}


def normalise_practice(ai: dict, base: dict) -> dict:
    out = {}
    qs = [q for q in (_norm_question(x) for x in _list(ai.get("quiz"))) if q]
    if len(qs) >= 3:
        # top up with data-based questions so there are always at least 5
        seen = {q["question"].lower() for q in qs}
        qs += [q for q in base["quiz"] if q["question"].lower() not in seen][:max(0, 6 - len(qs))]
        for n, q in enumerate(qs):
            q["id"] = f"q{n + 1}"
        out["quiz"] = qs[:7]
    puzzles = []
    fb = ai.get("find_bug") if isinstance(ai.get("find_bug"), dict) else {}
    lines = [str(l).rstrip() for l in _list(fb.get("lines"))]
    bug = _int(fb.get("bug_line"))
    if 3 <= len(lines) <= 16 and bug is not None and 0 <= bug < len(lines):
        puzzles.append({"id": "p-bug", "type": "find_bug", "title": _s(fb.get("title"), 200) or "Which line has the bug?",
                        "language": _s(fb.get("language"), 20).lower() or "text", "lines": [l[:160] for l in lines],
                        "bug_line": bug, "explanation": _s(fb.get("explanation"), 400)})
    pr = ai.get("predict") if isinstance(ai.get("predict"), dict) else {}
    plines = [str(l).rstrip() for l in _list(pr.get("lines"))]
    answers = [_s(a, 60) for a in _list(pr.get("answers")) if _s(a)]
    if isinstance(pr.get("answers"), str):
        answers = [_s(pr["answers"], 60)]
    if 1 <= len(plines) <= 10 and answers and _s(pr.get("prompt")):
        puzzles.append({"id": "p-predict", "type": "predict", "title": _s(pr.get("title"), 120) or "Predict the output",
                        "language": _s(fb.get("language"), 20).lower() or "text", "lines": [l[:160] for l in plines],
                        "prompt": _s(pr.get("prompt"), 240), "answers": answers[:5], "explanation": _s(pr.get("explanation"), 300)})
    out["puzzles"] = puzzles
    return out


# ---------------------------------------------------------------- main entry
def guide_id(owner: str, name: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", f"{owner}-{name}".lower()).strip("-")


async def build_guide(bundle: dict, level: str = "beginner", progress: Optional[Progress] = None,
                      use_ai: bool = True) -> tuple[dict, dict]:
    """Returns (guide, context). context is kept server-side for the chat."""
    async def step(s):
        if progress:
            await progress(s)

    meta = bundle["meta"]
    base = heuristics.basic_guide(bundle)
    guide = dict(base)
    notes = []
    ai_ok = 0

    if use_ai:
        await step("ai_overview")
        try:
            guide.update(normalise_overview(await llm.complete_json(prompts.overview(bundle, level), 2600), base))
            ai_ok += 1
        except llm.LLMError as e:
            notes.append(str(e))
            use_ai = "Can't reach" not in str(e) and "doesn't have" not in str(e)   # stop early if the model is down

    if use_ai:
        await step("ai_map")
        try:
            guide.update(normalise_map(await llm.complete_json(prompts.map_and_issues(bundle, level), 2600), base, bundle))
            ai_ok += 1
        except llm.LLMError as e:
            notes.append(str(e))

    # the order puzzle always follows the final setup steps
    order = heuristics.order_puzzle(bundle, guide["setup_steps"])
    if use_ai:
        await step("ai_practice")
        try:
            pr = normalise_practice(await llm.complete_json(prompts.practice(guide, bundle), 2200), base)
            if pr.get("quiz"):
                guide["quiz"] = pr["quiz"]
            guide["puzzles"] = pr.get("puzzles", []) + [order]
            ai_ok += 1
        except llm.LLMError as e:
            notes.append(str(e))
            guide["puzzles"] = [order]
    else:
        guide["puzzles"] = [order]

    if guide["first_contribution"].get("issue_number") and not any(
            i["number"] == guide["first_contribution"]["issue_number"] for i in guide["issues"]):
        guide["first_contribution"] = heuristics.first_contribution(guide["issues"])

    start = next((d for d in guide["directories"] if d.get("start_here")), None)
    guide.update({
        "id": guide_id(meta["owner"], meta["name"]),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": config.MODEL_DISPLAY_NAME if ai_ok else None,
        "ai": "full" if ai_ok == 3 else "partial" if ai_ok else "none",
        "ai_notes": notes[:2],
        "level": level,
        "repo": meta,
        "readiness": heuristics.readiness(bundle),
        "where_to_start": {"path": start["path"], "why": start["role"]} if start else None,
        "has_contributing": bool(bundle.get("contributing")),
    })
    context = {
        "readme": (bundle.get("readme") or "")[:6000],
        "contributing": (bundle.get("contributing") or "")[:2500],
        "paths": "\n".join(t["path"] for t in bundle.get("tree", [])[:600]),
    }
    return guide, context


def keyword_answer(question: str, guide: dict, context: dict) -> str:
    """Used for chat when the model is offline: honest keyword search, not a fake AI answer."""
    words = [w for w in re.findall(r"[a-zA-Z_]{3,}", question.lower()) if w not in
             {"the", "how", "what", "where", "which", "does", "this", "that", "with", "for", "and", "are", "can", "find", "file", "files"}]
    paths = context.get("paths", "").splitlines()
    hits = [p for p in paths if any(w in p.lower() for w in words)][:6]
    lines = []
    if any(w in ("run", "install", "setup", "start", "test", "tests") for w in words):
        lines.append("Setup: " + " -> ".join((s.get("command") or s["title"]).splitlines()[0] for s in guide["setup_steps"] if s.get("command") or s["title"]))
    if hits:
        lines.append("Matching files: " + ", ".join(hits))
    if not lines:
        lines.append("I couldn't find anything matching that. Try naming a file, folder or command.")
    return "The AI model is offline, so this is a plain keyword search. " + " ".join(lines)
