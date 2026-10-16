"""
Things we can work out from repository data without the AI model:

  * readiness score (always computed here, never by the model)
  * a complete "basic guide" used when the model is offline
  * fallbacks for any section the model leaves out or gets wrong
"""
import json
import re
from datetime import datetime, timezone
from typing import Optional

SKILLS = ["python", "javascript", "html-css", "docs", "testing", "git", "design"]

# ---------------------------------------------------------------- text utils
MD_IMG = re.compile(r"!\[[^\]]*\]\([^)]*\)")
MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
HTML = re.compile(r"<[^>]+>")


def clean_md(text: str) -> str:
    text = MD_IMG.sub("", text or "")
    text = MD_LINK.sub(r"\1", text)
    text = re.sub(r"\[([^\]]+)\](?!\()", r"\1", text)   # reference-style links like [WSGI]
    text = HTML.sub("", text)
    text = re.sub(r"`{1,3}", "", text)
    text = re.sub(r"(\*{1,2})([^*\n]+?)\1", r"\2", text)   # *em* / **bold**; underscores left alone (snake_case, __init__)
    return re.sub(r"[ \t]+", " ", text).strip()


def readme_paragraphs(readme: str, limit: int = 3) -> list[str]:
    """First real prose paragraphs of a README (skips badges, headings, code)."""
    out, in_code = [], False
    for block in re.split(r"\n\s*\n", readme or ""):
        if block.strip().startswith("```"):
            in_code = not in_code if block.count("```") % 2 else in_code
            continue
        if in_code:
            continue
        b = block.strip()
        if not b or b.startswith(("#", "|", ">", "-", "*", "<!--", "[!", "=")) or b.count("](") > 2:
            continue
        t = clean_md(b.replace("\n", " "))
        if len(t) < 60:
            continue
        out.append(t if len(t) <= 420 else t[:417].rsplit(" ", 1)[0] + "...")
        if len(out) >= limit:
            break
    return out


def first_sentence(text: str, max_len: int = 220) -> str:
    t = clean_md(re.sub(r"```.*?```", "", text or "", flags=re.S)).replace("\n", " ")
    t = re.sub(r"\s+", " ", t).strip()
    if not t:
        return ""
    m = re.match(r"(.{30,}?[.!?])(\s|$)", t)
    s = m.group(1) if m else t
    return s if len(s) <= max_len else s[:max_len - 3].rsplit(" ", 1)[0] + "..."


# ---------------------------------------------------------------- ecosystem
def ecosystem(bundle: dict) -> dict:
    deps, locks = bundle.get("dep_files", {}), bundle.get("lock_files", [])
    lang = (bundle["meta"].get("language") or "").lower()
    pkg = {}
    if "package.json" in deps:
        try:
            pkg = json.loads(deps["package.json"])
        except (json.JSONDecodeError, TypeError):
            pkg = {}
    eco = {"kind": "other", "pkg": pkg}
    if "package.json" in deps:
        pm = "pnpm" if "pnpm-lock.yaml" in locks else "yarn" if "yarn.lock" in locks else "bun" if "bun.lockb" in locks else "npm"
        eco.update(kind="node", pm=pm)
    elif any(p in deps for p in ("pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "Pipfile", "requirements-dev.txt")) or lang == "python":
        eco.update(kind="python")
    elif "Cargo.toml" in deps or lang == "rust":
        eco.update(kind="rust")
    elif "go.mod" in deps or lang == "go":
        eco.update(kind="go")
    elif "pom.xml" in deps:
        eco.update(kind="maven")
    elif "build.gradle" in deps or "build.gradle.kts" in deps:
        eco.update(kind="gradle")
    elif "Gemfile" in deps:
        eco.update(kind="ruby")
    elif "composer.json" in deps:
        eco.update(kind="php")
    return eco


FRAMEWORKS = {
    "react": "React", "next": "Next.js", "vue": "Vue", "svelte": "Svelte", "@angular/core": "Angular", "express": "Express",
    "typescript": "TypeScript", "vite": "Vite", "jest": "Jest", "vitest": "Vitest", "tailwindcss": "Tailwind CSS",
    "electron": "Electron", "django": "Django", "flask": "Flask", "fastapi": "FastAPI", "pytest": "pytest",
    "numpy": "NumPy", "pandas": "pandas", "torch": "PyTorch", "tensorflow": "TensorFlow", "sqlalchemy": "SQLAlchemy",
    "click": "Click", "pydantic": "Pydantic", "tokio": "Tokio", "serde": "Serde", "gin-gonic": "Gin", "spring": "Spring",
}


def tech_stack(bundle: dict) -> list[str]:
    stack = []
    if bundle["meta"].get("language"):
        stack.append(bundle["meta"]["language"])
    blob = " ".join(bundle.get("dep_files", {}).values()).lower()
    for key, label in FRAMEWORKS.items():
        if re.search(r'["\'\s/=]' + re.escape(key) + r'["\'\s>=<~^@\[]', blob) and label not in stack:
            stack.append(label)
    if "Dockerfile" in bundle.get("dep_files", {}):
        stack.append("Docker")
    return stack[:8]


# ---------------------------------------------------------------- readiness
def readiness(bundle: dict) -> dict:
    meta, checks = bundle["meta"], []

    def add(name, ok, pts, detail):
        checks.append({"name": name, "pass": bool(ok), "pts": pts if ok else 0, "max": pts, "detail": detail})

    rl = len(bundle.get("readme") or "")
    add("Clear README", rl > 1500, 20, f"{rl:,} characters" if rl else "No README found")
    add("CONTRIBUTING guide", bundle.get("contributing"), 20,
        bundle.get("contributing_path") or "No CONTRIBUTING file")
    beginner = sum(1 for i in bundle.get("issues", []) if i.get("beginner_score", 0) >= 2)
    add("Beginner-labelled issues", beginner > 0, 20, f"{beginner} open" if beginner else "None labelled")
    add("Dependency file", bundle.get("dep_files"), 15,
        ", ".join(list(bundle.get("dep_files", {}))[:2]) or "Not detected")
    add("Open-source licence", meta.get("license"), 10, meta.get("license") or "No licence")
    days = None
    if meta.get("updated_at"):
        try:
            days = (datetime.now(timezone.utc) - datetime.fromisoformat(meta["updated_at"].replace("Z", "+00:00"))).days
        except ValueError:
            days = None
    add("Active in last 90 days", days is not None and days <= 90 and not meta.get("archived"), 15,
        "Archived" if meta.get("archived") else (f"Last push {days} days ago" if days is not None else "Unknown"))
    score = sum(c["pts"] for c in checks)
    verdict = "Beginner friendly" if score >= 75 else "Some digging needed" if score >= 50 else "Expert territory"
    return {"score": score, "verdict": verdict, "checks": checks}


# ---------------------------------------------------------------- setup
def prerequisites(bundle: dict, eco: dict) -> list[dict]:
    pre = [{"name": "Git", "why": "To copy the project to your computer and send your changes back.", "link": "https://git-scm.com/downloads"}]
    runtime = {
        "node": {"name": "Node.js (LTS)", "why": "The project runs on JavaScript tooling.", "link": "https://nodejs.org/"},
        "python": {"name": "Python 3", "why": "The project is written in Python.", "link": "https://www.python.org/downloads/"},
        "rust": {"name": "Rust (rustup)", "why": "Installs the Rust compiler and Cargo.", "link": "https://rustup.rs/"},
        "go": {"name": "Go", "why": "The project is written in Go.", "link": "https://go.dev/dl/"},
        "maven": {"name": "Java JDK + Maven", "why": "Needed to build and test the Java code.", "link": "https://adoptium.net/"},
        "gradle": {"name": "Java JDK", "why": "Needed to build the project with Gradle.", "link": "https://adoptium.net/"},
        "ruby": {"name": "Ruby + Bundler", "why": "The project is written in Ruby.", "link": "https://www.ruby-lang.org/en/downloads/"},
        "php": {"name": "PHP + Composer", "why": "The project is written in PHP.", "link": "https://getcomposer.org/"},
    }.get(eco["kind"])
    if runtime:
        if eco["kind"] == "python":
            m = re.search(r'requires-python\s*=\s*"([^"]+)"', bundle.get("dep_files", {}).get("pyproject.toml", ""))
            if m:
                runtime = dict(runtime, name=f"Python {m.group(1)}")
        if eco["kind"] == "node" and eco.get("pm") in ("yarn", "pnpm", "bun"):
            pre.append(runtime)
            runtime = {"name": eco["pm"], "why": f"This project uses {eco['pm']} to install packages.", "link": "https://nodejs.org/"}
        pre.append(runtime)
    if "Dockerfile" in bundle.get("dep_files", {}) and eco["kind"] == "other":
        pre.append({"name": "Docker", "why": "The project is set up to run in a container.", "link": "https://docs.docker.com/get-docker/"})
    pre.append({"name": "A code editor", "why": "VS Code is free and works well for beginners.", "link": "https://code.visualstudio.com/"})
    pre.append({"name": "A GitHub account", "why": "You need one to fork the repository and open a pull request.", "link": "https://github.com/signup"})
    return pre


def test_command(bundle: dict, eco: dict) -> Optional[str]:
    paths = {t["path"] for t in bundle.get("tree", [])}
    k = eco["kind"]
    if k == "node":
        scripts = (eco.get("pkg") or {}).get("scripts", {})
        if "test" in scripts:
            return f"{eco['pm']} test" if eco["pm"] != "npm" else "npm test"
    if k == "python":
        blob = " ".join(bundle.get("dep_files", {}).values())
        if "pytest" in blob or any(p.startswith(("tests/", "test/")) for p in paths):
            return "pytest"
    return {"rust": "cargo test", "go": "go test ./...", "maven": "mvn test", "gradle": "./gradlew test", "ruby": "bundle exec rake test"}.get(k)


def setup_steps(bundle: dict, eco: dict) -> list[dict]:
    name = bundle["meta"]["name"]
    deps = bundle.get("dep_files", {})
    steps = [{"title": "Fork and clone the repository",
              "detail": "Click Fork on the GitHub page to make your own copy, then download it.",
              "command": f"git clone https://github.com/YOUR-USERNAME/{name}.git\ncd {name}"}]
    k = eco["kind"]
    if k == "node":
        steps.append({"title": "Install the dependencies", "detail": "Downloads every package listed in package.json.",
                      "command": {"npm": "npm install", "yarn": "yarn install", "pnpm": "pnpm install", "bun": "bun install"}[eco["pm"]]})
        scripts = (eco.get("pkg") or {}).get("scripts", {})
        run = next((s for s in ("dev", "start", "serve", "build") if s in scripts), None)
        if run:
            steps.append({"title": "Run the project", "detail": f"Runs the \"{run}\" script from package.json.",
                          "command": f"npm run {run}" if eco["pm"] == "npm" else f"{eco['pm']} {run}"})
    elif k == "python":
        steps.append({"title": "Create a virtual environment", "detail": "Keeps this project's packages separate from the rest of your computer.",
                      "command": "python -m venv .venv\n# Windows\n.venv\\Scripts\\activate\n# macOS / Linux\nsource .venv/bin/activate"})
        if "requirements-dev.txt" in deps:
            cmd = "pip install -r requirements-dev.txt"
        elif "pyproject.toml" in deps or "setup.py" in deps:
            cmd = 'pip install -e ".[dev]"' if "dev" in deps.get("pyproject.toml", "") else "pip install -e ."
        elif "requirements.txt" in deps:
            cmd = "pip install -r requirements.txt"
        else:
            cmd = "pip install -e ."
        steps.append({"title": "Install the dependencies", "detail": "Installs the project and the packages it needs.", "command": cmd})
    elif k == "rust":
        steps.append({"title": "Build the project", "detail": "Cargo downloads dependencies and compiles everything.", "command": "cargo build"})
    elif k == "go":
        steps.append({"title": "Download dependencies", "detail": "Fetches the modules listed in go.mod.", "command": "go mod download"})
    elif k == "maven":
        steps.append({"title": "Build the project", "detail": "Maven downloads dependencies and compiles the code.", "command": "mvn install -DskipTests"})
    elif k == "gradle":
        steps.append({"title": "Build the project", "detail": "Gradle downloads dependencies and compiles the code.", "command": "./gradlew build -x test"})
    elif k == "ruby":
        steps.append({"title": "Install the gems", "detail": "Installs everything listed in the Gemfile.", "command": "bundle install"})
    elif k == "php":
        steps.append({"title": "Install the dependencies", "detail": "Installs everything listed in composer.json.", "command": "composer install"})
    else:
        steps.append({"title": "Follow the README", "detail": "This project doesn't use a common package manager. Look for a 'Getting started' or 'Installation' section in the README.", "command": ""})
    t = test_command(bundle, eco)
    if t:
        steps.append({"title": "Run the tests", "detail": "Check everything passes before you change anything.", "command": t})
    return steps


# ---------------------------------------------------------------- code map
DIR_ROLES = {
    "src": ("The main source code.", "core"), "lib": ("Library code that does the main work.", "core"),
    "app": ("The application code.", "core"), "apps": ("The individual apps in this monorepo.", "core"),
    "packages": ("Separate packages in this monorepo.", "core"), "pkg": ("Reusable Go packages.", "core"),
    "cmd": ("Entry points for the command-line programs.", "core"), "internal": ("Private code used inside the project.", "core"),
    "server": ("The back-end server code.", "core"), "client": ("The front-end code that runs in the browser.", "core"),
    "core": ("The core logic of the project.", "core"), "components": ("Reusable UI components.", "core"),
    "tests": ("Automated tests. Add one when you fix a bug.", "useful"), "test": ("Automated tests.", "useful"),
    "__tests__": ("Automated tests.", "useful"), "spec": ("Automated tests.", "useful"),
    "docs": ("Documentation. Great for a first contribution.", "useful"), "doc": ("Documentation.", "useful"),
    "examples": ("Small example programs that show how to use the project.", "useful"),
    "example": ("Example code.", "useful"), "scripts": ("Helper scripts for maintainers.", "skip"),
    "tools": ("Developer tools and helpers.", "skip"), "benchmarks": ("Performance benchmarks.", "skip"),
    ".github": ("GitHub settings: CI workflows and issue templates.", "skip"),
    "public": ("Static files served as-is (images, icons).", "useful"), "static": ("Static files such as images and CSS.", "useful"),
    "assets": ("Images, fonts and other assets.", "skip"), "config": ("Configuration files.", "useful"),
    "dist": ("Built output. Don't edit by hand.", "skip"), "build": ("Built output. Don't edit by hand.", "skip"),
    "vendor": ("Third-party code copied into the repo.", "skip"), "migrations": ("Database migrations.", "skip"),
    "i18n": ("Translations.", "useful"), "locales": ("Translations.", "useful"),
}
FILE_ROLES = {
    "readme.md": ("Start here: what the project is and how to use it.", "core"),
    "contributing.md": ("The rules for contributing. Read before your first pull request.", "core"),
    "package.json": ("Lists the JavaScript dependencies and scripts.", "useful"),
    "pyproject.toml": ("Python project settings and dependencies.", "useful"),
    "requirements.txt": ("Python packages the project needs.", "useful"),
    "cargo.toml": ("Rust package settings and dependencies.", "useful"), "go.mod": ("Go module and dependencies.", "useful"),
    "dockerfile": ("Instructions to build a Docker image.", "skip"), "makefile": ("Shortcuts for common commands.", "useful"),
    "license": ("The licence: what others may do with the code.", "skip"), "changelog.md": ("History of changes per release.", "skip"),
}
ENTRY_CANDIDATES = ["src/index.ts", "src/index.js", "src/main.ts", "src/main.js", "src/App.tsx", "src/App.jsx", "index.js",
                    "main.py", "app.py", "manage.py", "src/main.rs", "src/lib.rs", "main.go", "cmd/main.go", "server.js", "app.js"]


def directories(bundle: dict) -> list[dict]:
    tree, name = bundle.get("tree", []), bundle["meta"]["name"].lower()
    top = [t for t in tree if "/" not in t["path"]]
    out = []
    for t in sorted(top, key=lambda x: (x["type"] != "tree", x["path"].lower())):
        p, low = t["path"], t["path"].lower()
        if t["type"] == "tree":
            role, imp = DIR_ROLES.get(low, (None, None))
            if not role and low.replace("-", "_") == name.replace("-", "_"):
                role, imp = ("The main package: the project's own code lives here.", "core")
            if role:
                out.append({"path": p + "/", "role": role, "importance": imp, "start_here": False})
        elif low in FILE_ROLES:
            role, imp = FILE_ROLES[low]
            out.append({"path": p, "role": role, "importance": imp, "start_here": False})
    paths = {t["path"] for t in tree}
    entry = next((c for c in ENTRY_CANDIDATES if c in paths), None)
    if not entry:
        pkg = name.replace("-", "_")
        entry = next((c for c in (f"src/{pkg}/__init__.py", f"{pkg}/__init__.py", f"src/{pkg}/main.py", f"{pkg}/main.py") if c in paths), None)
    if entry:
        out.insert(0, {"path": entry, "role": "Where the code starts. Read this first to see how the pieces connect.", "importance": "core", "start_here": True})
    elif out:
        rd = next((d for d in out if d["path"].lower() == "readme.md"), out[0])
        rd["start_here"] = True
    core_first = sorted(out, key=lambda d: (not d["start_here"], {"core": 0, "useful": 1, "skip": 2}[d["importance"]]))
    return core_first[:14]


# ---------------------------------------------------------------- issues
SKILL_WORDS = {
    "docs": ["doc", "readme", "typo", "documentation", "guide", "tutorial", "spelling"],
    "testing": ["test", "coverage", "flaky", "ci"],
    "html-css": ["css", "style", "layout", "html", "responsive", "dark mode", "theme"],
    "design": ["ui", "ux", "design", "accessibility", "a11y", "icon"],
    "git": ["workflow", "github action", "release"],
}


def issue_skills(issue: dict, lang: Optional[str]) -> list[str]:
    text = (issue["title"] + " " + " ".join(issue.get("labels", []))).lower()
    skills = [s for s, words in SKILL_WORDS.items() if any(w in text for w in words)]
    code = {"Python": "python", "JavaScript": "javascript", "TypeScript": "javascript"}.get(lang or "")
    if code and "docs" not in skills:
        skills.insert(0, code)
    return skills[:3] or ([code] if code else ["git"])


def issues(bundle: dict) -> list[dict]:
    tree_names = {}
    for t in bundle.get("tree", []):
        base = t["path"].rsplit("/", 1)[-1]
        if t["type"] == "blob" and len(base) > 5 and "." in base:
            tree_names.setdefault(base, t["path"])
    out = []
    for i in bundle.get("issues", [])[:10]:
        bs = i.get("beginner_score", 0)
        diff = "easy" if bs >= 3 else "medium" if bs >= 1 or len(i.get("body", "")) < 500 else "hard"
        text = i["title"] + " " + i.get("body", "")
        related = [p for b, p in tree_names.items() if b in text][:3]
        expl = first_sentence(i.get("body", "")) or "Open the issue on GitHub to read the full details."
        out.append({
            "number": i["number"], "title": i["title"], "url": i["url"], "labels": i.get("labels", [])[:4],
            "difficulty": diff, "skills": issue_skills(i, bundle["meta"].get("language")),
            "explanation": expl, "related_files": related,
            "estimated_time": {"easy": "1-2 hours", "medium": "half a day", "hard": "a few days"}[diff],
        })
    return out


def first_contribution(issue_list: list[dict]) -> dict:
    pick = next((i for i in issue_list if i["difficulty"] == "easy"), None) or (issue_list[0] if issue_list else None)
    if pick:
        return {"issue_number": pick["number"], "title": pick["title"],
                "why": "It's the most beginner-friendly open issue: small in scope and clearly described."}
    return {"issue_number": None, "title": "Improve the setup instructions in the README",
            "why": "There are no beginner issues open right now. Following the setup steps and fixing anything unclear in the README is a classic first contribution."}


# ---------------------------------------------------------------- rules + glossary
def contributing_rules(bundle: dict) -> list[str]:
    rules = []
    for line in (bundle.get("contributing") or "").splitlines():
        m = re.match(r"^\s*(?:[-*+]|\d+[.)])\s+(.{25,200})$", line)
        if m:
            t = clean_md(m.group(1)).rstrip(":")
            if t and not t.lower().startswith(("http", "see ")) and t not in rules:
                rules.append(t)
        if len(rules) >= 6:
            break
    if len(rules) < 3:
        rules = ["Comment on an issue before you start, so two people don't work on the same thing.",
                 "Create a new branch for each change. Don't work on main.",
                 "Run the tests before you push.",
                 "Keep each pull request small and link the issue with 'Fixes #123'.",
                 "Be kind and patient in reviews."]
    return rules


GLOSSARY = {
    "fork": "Your own copy of someone else's repository on GitHub.",
    "clone": "Downloading a repository from GitHub to your computer.",
    "branch": "A separate line of work, so your changes don't touch the main code until they're ready.",
    "commit": "A saved snapshot of your changes, with a short message describing them.",
    "pull request": "A request asking the maintainers to merge your changes into their project.",
    "issue": "A task, bug report or idea tracked on GitHub.",
    "dependency": "Another package this project needs in order to work.",
    "CI": "Continuous integration: robots that run the tests automatically on every change.",
    "maintainer": "A person who looks after the project and reviews contributions.",
}
ECO_TERMS = {
    "node": {"npm": "The package manager that installs JavaScript libraries.", "package.json": "The file listing a JavaScript project's dependencies and scripts."},
    "python": {"virtual environment": "A private folder of Python packages for one project.", "pip": "Python's tool for installing packages."},
    "rust": {"Cargo": "Rust's build tool and package manager.", "crate": "A Rust package."},
    "go": {"module": "A Go project and its list of dependencies (go.mod)."},
}


def glossary(bundle: dict, eco: dict) -> list[dict]:
    terms = dict(GLOSSARY)
    terms.update(ECO_TERMS.get(eco["kind"], {}))
    if not any(t["path"].startswith(".github/workflows") for t in bundle.get("tree", [])):
        terms.pop("CI", None)
    return [{"term": k, "meaning": v} for k, v in terms.items()]


# ---------------------------------------------------------------- practice
LANG_OPTIONS = ["Python", "JavaScript", "TypeScript", "Go", "Rust", "Java", "Ruby", "C++", "PHP"]


def quiz(bundle: dict, steps: list[dict], dirs: list[dict]) -> list[dict]:
    q, meta = [], bundle["meta"]
    if meta.get("language"):
        opts = [meta["language"]] + [l for l in LANG_OPTIONS if l != meta["language"]][:3]
        q.append({"type": "mcq", "question": f"Which language is most of {meta['name']} written in?",
                  "options": opts, "answer": 0, "explanation": f"GitHub reports {meta['language']} as the main language."})
    dep = next(iter(bundle.get("dep_files", {})), None)
    others = [d["path"] for d in dirs if d["path"] != dep and not d["path"].endswith("/")][:1] + [".github/", "LICENSE", "docs/"]
    if dep:
        opts = [dep] + [o for o in others if o != dep][:3]
        q.append({"type": "mcq", "question": "Which file lists what the project needs installed?", "options": opts, "answer": 0,
                  "explanation": f"{dep} is the dependency file for this project."})
    start = next((d for d in dirs if d.get("start_here")), None)
    if start:
        wrong = [d["path"] for d in dirs if not d.get("start_here")][:3]
        if len(wrong) == 3:
            q.append({"type": "mcq", "question": "Which file or folder should you read first?", "options": [start["path"]] + wrong,
                      "answer": 0, "explanation": start["role"]})
    q.append({"type": "truefalse", "question": "You should make your changes directly on the main branch.", "options": ["True", "False"],
              "answer": 1, "explanation": "Always create a new branch for each change, so main stays clean."})
    q.append({"type": "fill", "question": "To get your own copy of the repository on GitHub, you ____ it.",
              "options": ["fork", "merge", "push", "rebase"], "answer": 0, "explanation": "Forking creates your own copy on GitHub."})
    t = next((s["command"] for s in steps if s["title"].lower().startswith("run the tests")), None)
    if t:
        q.append({"type": "fill", "question": "To run the tests, type ____ in the terminal.",
                  "options": [t] + [x for x in ["npm test", "pytest", "cargo test", "make check", "go test ./..."] if x != t][:3],
                  "answer": 0, "explanation": f"This project runs its tests with {t}."})
    if meta.get("license"):
        q.append({"type": "truefalse", "question": f"{meta['name']} is released under the {meta['license']} licence.",
                  "options": ["True", "False"], "answer": 0, "explanation": "The licence is listed in the repository's LICENSE file."})
    for n, item in enumerate(q):
        item["id"] = f"q{n + 1}"
    return q[:6]


def order_puzzle(bundle: dict, steps: list[dict]) -> dict:
    name = bundle["meta"]["name"]
    t = next((s["command"] for s in steps if s["title"].lower().startswith("run the tests")), None)
    lines = [f"git clone https://github.com/YOUR-USERNAME/{name}.git", "git checkout -b fix/my-first-change"]
    if t:
        lines.append(t)
    lines += ['git commit -am "Describe your change"', "git push origin fix/my-first-change"]
    return {"id": "p-order", "type": "order", "title": "Put these steps for your first pull request in the right order.",
            "language": "bash", "lines": lines,
            "explanation": "Clone your fork, make a branch, check the tests, commit, then push and open the pull request."}


# ---------------------------------------------------------------- full basic guide
def summary(bundle: dict) -> dict:
    meta = bundle["meta"]
    paras = readme_paragraphs(bundle.get("readme", ""))
    one = meta.get("description") or (paras[0] if paras else f"{meta['name']} is an open-source project on GitHub.")
    return {"one_liner": one, "plain_explanation": paras[:3] or [one],
            "who_its_for": "Developers who want to use or improve " + meta["name"] + ".",
            "tech_stack": tech_stack(bundle)}


def basic_guide(bundle: dict) -> dict:
    eco = ecosystem(bundle)
    steps = setup_steps(bundle, eco)
    dirs = directories(bundle)
    iss = issues(bundle)
    return {
        "summary": summary(bundle),
        "prerequisites": prerequisites(bundle, eco),
        "setup_steps": steps,
        "directories": dirs,
        "glossary": glossary(bundle, eco),
        "issues": iss,
        "first_contribution": first_contribution(iss),
        "contributing_rules": contributing_rules(bundle),
        "quiz": quiz(bundle, steps, dirs),
        "puzzles": [order_puzzle(bundle, steps)],
    }
