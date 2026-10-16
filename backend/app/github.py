"""
Everything we read from GitHub, in one "bundle" dict:

    meta, readme, tree, contributing, dep_files, issues, source_sample

Uses the REST API for metadata/tree/issues (5 calls per repo) and
raw.githubusercontent.com for file contents (not counted against the API limit).
"""
import asyncio
import re
from typing import Awaitable, Callable, Optional

import httpx

from . import config

API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com"

REPO_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")

DEP_FILES = [
    "package.json", "requirements.txt", "requirements-dev.txt", "pyproject.toml", "setup.py",
    "setup.cfg", "Pipfile", "environment.yml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle",
    "build.gradle.kts", "Gemfile", "composer.json", "pubspec.yaml", "Makefile", "Dockerfile",
    "docker-compose.yml", ".nvmrc", ".python-version", "CMakeLists.txt", "mix.exs", "deno.json",
]
LOCK_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "poetry.lock", "uv.lock", "Pipfile.lock"]
CONTRIBUTING_PATHS = ["CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md", "CONTRIBUTING.rst", "CONTRIBUTING.txt", "contributing.md"]
BEGINNER_LABELS = ["good first issue", "good-first-issue", "first-timers-only", "beginner", "easy", "starter",
                   "help wanted", "documentation", "docs", "low hanging fruit", "up-for-grabs"]

LANG_EXT = {
    "Python": [".py"], "JavaScript": [".js", ".mjs", ".jsx"], "TypeScript": [".ts", ".tsx"],
    "Go": [".go"], "Rust": [".rs"], "Java": [".java"], "Kotlin": [".kt"], "Ruby": [".rb"],
    "PHP": [".php"], "C": [".c", ".h"], "C++": [".cpp", ".cc", ".hpp"], "C#": [".cs"],
    "Swift": [".swift"], "Dart": [".dart"], "Elixir": [".ex"], "Shell": [".sh"],
}
SKIP_DIRS = ("node_modules/", "vendor/", "dist/", "build/", "third_party/", "test/", "tests/", "__tests__",
             "examples/", "example/", "docs/", "fixtures/", ".github/", "migrations/", "benchmarks/")


class GitHubError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def parse_repo(text: str) -> tuple[str, str]:
    """'https://github.com/a/b/tree/main' or 'a/b' -> ('a', 'b')."""
    s = (text or "").strip()
    s = re.sub(r"^https?://", "", s)
    s = re.sub(r"^(www\.)?github\.com/", "", s)
    s = s.split("?")[0].split("#")[0].strip("/")
    parts = [p for p in s.split("/") if p]
    if len(parts) < 2:
        raise GitHubError(400, "That isn't a GitHub repository. Use owner/name, for example pallets/flask.")
    owner, name = parts[0], re.sub(r"\.git$", "", parts[1])
    if not REPO_RE.match(owner) or not REPO_RE.match(name):
        raise GitHubError(400, "That isn't a GitHub repository. Use owner/name, for example pallets/flask.")
    return owner, name


def _headers(raw: bool = False) -> dict:
    h = {"User-Agent": "OpenCipher-Onboarding", "X-GitHub-Api-Version": "2022-11-28",
         "Accept": "application/vnd.github.raw" if raw else "application/vnd.github+json"}
    if config.GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {config.GITHUB_TOKEN}"
    return h


async def _api(client: httpx.AsyncClient, path: str, raw: bool = False, params: Optional[dict] = None):
    r = await client.get(API + path, headers=_headers(raw), params=params)
    if r.status_code == 404:
        return None
    if r.status_code in (403, 429) and r.headers.get("x-ratelimit-remaining") == "0":
        raise GitHubError(429, "GitHub's hourly limit was reached. Add a GITHUB_TOKEN to backend/.env, or try again later.")
    if r.status_code >= 400:
        raise GitHubError(502, f"GitHub answered with an error ({r.status_code}). Try again in a minute.")
    return r.text if raw else r.json()


async def _raw(client: httpx.AsyncClient, owner: str, name: str, branch: str, path: str, limit: int = 20000) -> Optional[str]:
    try:
        r = await client.get(f"{RAW}/{owner}/{name}/{branch}/{path}", headers={"User-Agent": "OpenCipher-Onboarding"})
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    return r.text[:limit]


def _label_names(issue: dict) -> list[str]:
    return [(l.get("name") if isinstance(l, dict) else str(l)) for l in issue.get("labels", [])]


def _beginner_score(labels: list[str]) -> int:
    low = [l.lower() for l in labels]
    score = 0
    for l in low:
        if "good first" in l or "first-timers" in l or "beginner" in l or l in ("easy", "starter"):
            score += 3
        elif "help wanted" in l or "up-for-grabs" in l:
            score += 2
        elif "doc" in l:
            score += 1
    return score


def pick_source_sample(tree: list[dict], language: Optional[str]) -> Optional[str]:
    """Choose one small, real source file for the find-the-bug puzzle."""
    exts = LANG_EXT.get(language or "", [])
    if not exts:
        exts = [e for v in LANG_EXT.values() for e in v]
    best, best_score = None, 1e9
    for f in tree:
        p = f["path"]
        if f["type"] != "blob" or not any(p.endswith(e) for e in exts):
            continue
        low = p.lower()
        if any(d in low for d in SKIP_DIRS) or "test" in low.split("/")[-1] or low.endswith(".min.js"):
            continue
        size = f.get("size") or 0
        if not 400 <= size <= 8000 or p.count("/") > 4:
            continue
        score = abs(size - 2500) + p.count("/") * 300
        if "/src/" in "/" + low or low.startswith("src/") or low.startswith("lib/"):
            score -= 800
        if score < best_score:
            best, best_score = p, score
    return best


Progress = Callable[[str], Awaitable[None]]


async def fetch_bundle(owner: str, name: str, progress: Optional[Progress] = None) -> dict:
    async def step(s: str):
        if progress:
            await progress(s)

    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        # 1. metadata
        await step("meta")
        meta = await _api(client, f"/repos/{owner}/{name}")
        if not meta:
            raise GitHubError(404, "We couldn't find that repository. Check the spelling, and make sure it's public.")
        if meta.get("private"):
            raise GitHubError(403, "That repository is private. OpenCipher only reads public repositories.")
        owner, name = meta["owner"]["login"], meta["name"]   # canonical casing
        branch = meta.get("default_branch") or "main"

        # 2. README + tree in parallel
        await step("readme")
        readme_task = _api(client, f"/repos/{owner}/{name}/readme", raw=True)
        tree_task = _api(client, f"/repos/{owner}/{name}/git/trees/{branch}", params={"recursive": "1"})
        readme, tree_json = await asyncio.gather(readme_task, tree_task)
        await step("tree")
        tree = [{"path": t["path"], "type": t["type"], "size": t.get("size")}
                for t in (tree_json or {}).get("tree", [])][:6000]
        paths = {t["path"] for t in tree}

        # 3. dependency files + CONTRIBUTING (raw, parallel)
        await step("deps")
        dep_paths = [p for p in DEP_FILES if p in paths][:6]
        contrib_path = next((p for p in CONTRIBUTING_PATHS if p in paths), None)
        sample_path = pick_source_sample(tree, meta.get("language"))
        jobs = [_raw(client, owner, name, branch, p, 6000) for p in dep_paths]
        jobs.append(_raw(client, owner, name, branch, contrib_path, 12000) if contrib_path else asyncio.sleep(0, None))
        jobs.append(_raw(client, owner, name, branch, sample_path, 9000) if sample_path else asyncio.sleep(0, None))
        results = await asyncio.gather(*jobs)
        dep_files = {p: t for p, t in zip(dep_paths, results[:len(dep_paths)]) if t}
        contributing = results[len(dep_paths)]
        sample_text = results[len(dep_paths) + 1]
        await step("contributing")

        # 4. issues: recent open issues + explicitly labelled beginner issues
        await step("issues")
        recent, labelled = await asyncio.gather(
            _api(client, f"/repos/{owner}/{name}/issues", params={"state": "open", "per_page": 50, "sort": "updated"}),
            _api(client, f"/repos/{owner}/{name}/issues", params={"state": "open", "per_page": 30, "labels": "good first issue"}),
        )
        seen, issues = set(), []
        for it in (labelled or []) + (recent or []):
            if "pull_request" in it or it["number"] in seen:
                continue
            seen.add(it["number"])
            labels = _label_names(it)
            issues.append({
                "number": it["number"], "title": it.get("title", ""), "url": it.get("html_url", ""),
                "labels": labels, "body": (it.get("body") or "")[:700], "comments": it.get("comments", 0),
                "assigned": bool(it.get("assignee")), "created_at": it.get("created_at"),
                "beginner_score": _beginner_score(labels),
            })
        # beginner-labelled and unassigned first, then fewer comments
        issues.sort(key=lambda i: (-i["beginner_score"], i["assigned"], i["comments"]))
        issues = issues[:15]

    lic = meta.get("license") or {}
    return {
        "meta": {
            "owner": owner, "name": name, "full_name": f"{owner}/{name}", "url": meta.get("html_url"),
            "description": meta.get("description") or "", "stars": meta.get("stargazers_count", 0),
            "forks": meta.get("forks_count", 0), "open_issues": meta.get("open_issues_count", 0),
            "language": meta.get("language"), "license": lic.get("spdx_id") if lic.get("spdx_id") != "NOASSERTION" else lic.get("name"),
            "topics": meta.get("topics", []), "updated_at": meta.get("pushed_at"), "default_branch": branch,
            "avatar": (meta.get("owner") or {}).get("avatar_url"), "archived": meta.get("archived", False),
        },
        "readme": (readme or "")[:30000],
        "tree": tree,
        "tree_truncated": bool((tree_json or {}).get("truncated")),
        "contributing": contributing, "contributing_path": contrib_path,
        "dep_files": dep_files,
        "lock_files": [p for p in LOCK_FILES if p in paths],
        "issues": issues,
        "source_sample": {"path": sample_path, "text": sample_text} if sample_text else None,
    }
