"""
The three prompts sent to the model. Small models (8B) do far better with
three focused requests than one giant one.
"""
SKILL_IDS = "python, javascript, html-css, docs, testing, git, design"

LEVELS = {
    "beginner": "a complete beginner who has never contributed to open source",
    "intermediate": "someone who can code but is new to this project",
    "advanced": "an experienced developer who wants the fast version",
}


def tree_listing(bundle: dict, limit: int = 180) -> str:
    """Top two levels of the file tree, folders marked with a trailing slash."""
    rows = []
    for t in bundle.get("tree", []):
        if t["path"].count("/") <= 1:
            rows.append(t["path"] + ("/" if t["type"] == "tree" else ""))
    rows.sort(key=lambda p: (p.count("/"), p.lower()))
    return "\n".join(rows[:limit])


def issues_listing(bundle: dict) -> str:
    out = []
    for i in bundle.get("issues", [])[:12]:
        body = " ".join((i.get("body") or "").split())[:280]
        out.append(f"#{i['number']} [{', '.join(i.get('labels', [])) or 'no labels'}] {i['title']}\n   {body}")
    return "\n".join(out) or "(no open issues)"


def overview(bundle: dict, level: str) -> str:
    m = bundle["meta"]
    deps = "\n\n".join(f"--- {p} ---\n{t[:1500]}" for p, t in list(bundle.get("dep_files", {}).items())[:4]) or "(none found)"
    contrib = (bundle.get("contributing") or "(no CONTRIBUTING file)")[:2500]
    top = "\n".join(t["path"] + ("/" if t["type"] == "tree" else "") for t in bundle.get("tree", []) if "/" not in t["path"])[:1500]
    return f"""Repository: {m['full_name']}
Description: {m.get('description') or '(none)'}
Main language: {m.get('language') or 'unknown'}
The reader is {LEVELS.get(level, LEVELS['beginner'])}.

README (excerpt):
<<<
{(bundle.get('readme') or '(no README)')[:6000]}
>>>

Dependency files:
{deps}

CONTRIBUTING (excerpt):
<<<
{contrib}
>>>

Top-level files and folders:
{top}

Write an onboarding guide for this repository. Return JSON with exactly these keys:
{{
  "one_liner": "one plain sentence: what this project does",
  "plain_explanation": ["2 to 4 short paragraphs: what it does, how the main pieces fit together, where newcomers usually start"],
  "who_its_for": "one sentence",
  "tech_stack": ["up to 8 technologies this project really uses"],
  "prerequisites": [{{"name": "tool to install", "why": "one short sentence", "link": "official download page URL"}}],
  "setup_steps": [{{"title": "short imperative title", "detail": "one sentence", "command": "exact terminal commands, one per line"}}],
  "glossary": [{{"term": "word a beginner will meet in this project", "meaning": "one short plain sentence"}}],
  "contributing_rules": ["up to 6 short rules, taken from CONTRIBUTING"]
}}
Rules:
- setup_steps: 4 to 7 steps, starting with forking and cloning (use https://github.com/YOUR-USERNAME/{m['name']}.git) and ending with running the tests.
- Only use commands that appear in, or follow directly from, the README, CONTRIBUTING or dependency files.
- glossary: 6 to 10 terms. prerequisites: 3 to 6 items.
- Plain words. No marketing language."""


def map_and_issues(bundle: dict, level: str) -> str:
    m = bundle["meta"]
    return f"""Repository: {m['full_name']} ({m.get('language') or 'unknown language'})
The reader is {LEVELS.get(level, LEVELS['beginner'])}.

Files and folders (top two levels; folders end with /):
{tree_listing(bundle)}

Open issues:
{issues_listing(bundle)}

Return JSON with exactly these keys:
{{
  "directories": [{{"path": "exact path from the list above", "role": "one plain sentence: what lives here", "importance": "core | useful | skip", "start_here": false}}],
  "issues": [{{"number": 123, "difficulty": "easy | medium | hard", "skills": ["ids from: {SKILL_IDS}"], "explanation": "1-2 plain sentences: what needs doing", "related_files": ["exact paths from the list above"], "estimated_time": "for example 1-2 hours"}}],
  "first_contribution": {{"issue_number": 123, "why": "1-2 sentences: why this is the best first issue"}}
}}
Rules:
- directories: 8 to 14 of the most important items, most important first. Set start_here to true on exactly ONE item: the single best file or folder for a newcomer to read first.
- importance: core = the main code, useful = tests/docs/config, skip = things a beginner can ignore.
- issues: up to 8 of the most beginner-friendly issues from the list, using their exact numbers.
- first_contribution.issue_number must be one of the issue numbers above.
- Only use paths that appear in the list above."""


def practice(guide: dict, bundle: dict) -> str:
    dirs = "\n".join(f"- {d['path']}: {d['role']}" for d in guide["directories"][:10])
    steps = "\n".join(f"- {s['title']}: {s['command'].splitlines()[0] if s.get('command') else ''}" for s in guide["setup_steps"])
    rules = "\n".join(f"- {r}" for r in guide["contributing_rules"][:6])
    sample = bundle.get("source_sample") or {}
    code = ""
    if sample.get("text"):
        lines = sample["text"].splitlines()[:70]
        code = f"\nSource file {sample['path']}:\n<<<\n" + "\n".join(lines) + "\n>>>\n"
    return f"""Project: {bundle['meta']['full_name']}
What it is: {guide['summary']['one_liner']}

Key files and folders:
{dirs}

Setup steps:
{steps}

Contribution rules:
{rules}
{code}
Write a short practice round that checks a newcomer understood THIS project. Return JSON with exactly these keys:
{{
  "quiz": [{{"type": "mcq | truefalse | fill", "question": "", "options": ["..."], "answer": 0, "explanation": "one sentence"}}],
  "find_bug": {{"title": "This code should <what it does>. Which line has the bug?", "language": "python", "lines": ["line 1", "line 2"], "bug_line": 0, "explanation": "what is wrong and the fix"}},
  "predict": {{"title": "short title", "lines": ["code line"], "prompt": "a question with one short exact answer", "answers": ["accepted answer"], "explanation": "one sentence"}}
}}
Rules:
- quiz: exactly 5 questions about this project's structure, setup and rules. mcq has 4 options. truefalse options are ["True", "False"]. fill questions contain ____ and have 4 options. answer is the 0-based index of the correct option.
- find_bug: copy 5 to 12 consecutive lines from the source file and change exactly ONE line so it contains a realistic beginner bug. bug_line is the 0-based index of that line. If there is no source file, write a tiny example in the project's language.
- predict: 2 to 6 lines of simple code from this project's language and a question whose answer is one word or number."""


def chat_system(guide: dict, context: dict) -> str:
    return f"""You are OpenCipher, a friendly mentor answering a newcomer's questions about the GitHub repository {guide['repo']['full_name']}.
Answer in 2 to 6 sentences of plain English. Mention exact file paths and commands when they help.
Only use the repository information below. If the answer isn't there, say so and suggest where to look.

Summary: {guide['summary']['one_liner']}
{' '.join(guide['summary']['plain_explanation'])}

Setup:
{chr(10).join('- ' + s['title'] + ': ' + (s.get('command') or '').replace(chr(10), ' && ') for s in guide['setup_steps'])}

Key paths:
{chr(10).join('- ' + d['path'] + ': ' + d['role'] for d in guide['directories'])}

Other file paths:
{context.get('paths', '')[:3000]}

README (excerpt):
{context.get('readme', '')[:4000]}

CONTRIBUTING (excerpt):
{context.get('contributing', '')[:1500]}"""
