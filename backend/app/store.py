"""
Saves guides and learner progress.

  MONGODB_URI set   -> MongoDB Atlas (collections: guides, progress)
  MONGODB_URI empty -> JSON files in backend/data/  (zero setup, great for demos)
"""
import json
import re
import time
from typing import Optional

from . import config


class LocalStore:
    kind = "local files"

    def __init__(self):
        self.dir = config.DATA_DIR
        (self.dir / "guides").mkdir(parents=True, exist_ok=True)
        self.progress_file = self.dir / "progress.json"

    def _gpath(self, gid: str):
        return self.dir / "guides" / (re.sub(r"[^a-z0-9-]", "", gid) + ".json")

    async def get_guide(self, gid: str) -> Optional[dict]:
        p = self._gpath(gid)
        if not p.exists():
            return None
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

    async def save_guide(self, guide: dict, context: dict):
        doc = {"_id": guide["id"], "guide": guide, "context": context, "saved_at": time.time()}
        self._gpath(guide["id"]).write_text(json.dumps(doc), encoding="utf-8")

    async def recent(self, limit: int = 8) -> list[dict]:
        files = sorted((self.dir / "guides").glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)[:limit]
        out = []
        for f in files:
            try:
                g = json.loads(f.read_text(encoding="utf-8"))["guide"]
                out.append({"id": g["id"], "full_name": g["repo"]["full_name"], "one_liner": g["summary"]["one_liner"],
                            "score": g["readiness"]["score"], "generated_at": g["generated_at"]})
            except (KeyError, json.JSONDecodeError, OSError):
                continue
        return out

    def _all_progress(self) -> dict:
        try:
            return json.loads(self.progress_file.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    async def get_progress(self, user: str, gid: str) -> Optional[dict]:
        return self._all_progress().get(f"{user}:{gid}")

    async def save_progress(self, user: str, gid: str, data: dict):
        allp = self._all_progress()
        allp[f"{user}:{gid}"] = dict(data, user_id=user, guide_id=gid, updated_at=time.time())
        self.progress_file.write_text(json.dumps(allp), encoding="utf-8")


class MongoStore:
    kind = "MongoDB Atlas"

    def __init__(self, uri: str):
        from motor.motor_asyncio import AsyncIOMotorClient
        self.client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=6000)
        self.db = self.client[config.MONGODB_DB]

    async def get_guide(self, gid: str) -> Optional[dict]:
        return await self.db.guides.find_one({"_id": gid})

    async def save_guide(self, guide: dict, context: dict):
        await self.db.guides.replace_one({"_id": guide["id"]},
                                         {"_id": guide["id"], "guide": guide, "context": context, "saved_at": time.time()},
                                         upsert=True)

    async def recent(self, limit: int = 8) -> list[dict]:
        cur = self.db.guides.find({}, {"guide.id": 1, "guide.repo.full_name": 1, "guide.summary.one_liner": 1,
                                       "guide.readiness.score": 1, "guide.generated_at": 1}).sort("saved_at", -1).limit(limit)
        return [{"id": d["guide"]["id"], "full_name": d["guide"]["repo"]["full_name"],
                 "one_liner": d["guide"]["summary"]["one_liner"], "score": d["guide"]["readiness"]["score"],
                 "generated_at": d["guide"]["generated_at"]} async for d in cur]

    async def get_progress(self, user: str, gid: str) -> Optional[dict]:
        d = await self.db.progress.find_one({"_id": f"{user}:{gid}"})
        if d:
            d.pop("_id", None)
        return d

    async def save_progress(self, user: str, gid: str, data: dict):
        await self.db.progress.replace_one({"_id": f"{user}:{gid}"},
                                           dict(data, _id=f"{user}:{gid}", user_id=user, guide_id=gid, updated_at=time.time()),
                                           upsert=True)


def make_store():
    if config.MONGODB_URI:
        try:
            return MongoStore(config.MONGODB_URI)
        except Exception as e:  # motor missing or bad URI: keep the app running
            print(f"[store] MongoDB unavailable ({e}); using local files instead.")
    return LocalStore()
