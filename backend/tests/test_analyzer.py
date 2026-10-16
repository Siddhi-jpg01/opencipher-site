"""
Offline tests for the analyzer. Run from backend/:
    python -m tests.test_analyzer
No network, no model needed: the model is simulated.
"""
import asyncio
import json
import sys
import types

# allow running without httpx installed (only needed for real network calls)
try:
    import httpx  # noqa: F401
except ImportError:
    fake = types.ModuleType("httpx")
    for n in ("AsyncClient", "HTTPError", "ConnectError", "TimeoutException", "HTTPStatusError"):
        setattr(fake, n, type(n, (Exception,), {}))
    sys.modules["httpx"] = fake

from app import analyzer, heuristics, llm  # noqa: E402
from tests import fixture  # noqa: E402


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        check.failed += 1


check.failed = 0


async def main():
    b = fixture.bundle()

    # ---- 1. no model: complete basic guide
    g, ctx = await analyzer.build_guide(b, use_ai=False)
    check(g["ai"] == "none" and g["model"] is None, "basic guide marked as non-AI")
    check(g["readiness"]["score"] >= 75, f"readiness computed from data ({g['readiness']['score']})")
    check(any(s["command"] == "pytest" for s in g["setup_steps"]), "detects pytest as test command")
    check(any(p["name"].startswith("Python >=3.9") for p in g["prerequisites"]), "reads requires-python")
    check(g["directories"][0]["start_here"] and g["directories"][0]["path"] == "src/flask/__init__.py" or
          any(d["start_here"] for d in g["directories"]), "one start-here entry")
    check(g["first_contribution"]["issue_number"] == 5612, "picks the good-first-issue")
    check(len(g["quiz"]) >= 5, f"basic quiz has {len(g['quiz'])} questions")
    check(g["puzzles"][0]["type"] == "order", "order puzzle present")
    check(any("Black" in r for r in g["contributing_rules"]), "extracts CONTRIBUTING rules")
    check("Flask" in g["summary"]["tech_stack"] or "Python" in g["summary"]["tech_stack"], f"tech stack {g['summary']['tech_stack']}")
    check(any(i["related_files"] for i in g["issues"]), "links issues to real files")
    check("keyword search" in analyzer.keyword_answer("how do I run the tests", g, ctx), "offline chat is honest")

    # ---- 2. simulated model with typical mistakes
    answers = iter([fixture.AI_OVERVIEW, fixture.AI_MAP, fixture.AI_PRACTICE])

    async def fake_json(prompt, max_tokens=0):
        return next(answers)
    llm.complete_json = fake_json
    g2, _ = await analyzer.build_guide(b, use_ai=True)
    check(g2["ai"] == "full" and g2["model"], "AI guide marked full")
    check(g2["setup_steps"][0]["command"].startswith("git clone"), "strips $ prompts from commands")
    check("\n" in g2["setup_steps"][1]["command"], "list commands joined into lines")
    paths = [d["path"] for d in g2["directories"]]
    check("src/flask/routing.py" not in paths, "drops hallucinated file")
    check("tests/" in paths and "docs/" in paths, f"normalises folder paths {paths}")
    check(sum(d["start_here"] for d in g2["directories"]) == 1, "exactly one start-here")
    check(next(d for d in g2["directories"] if d["path"] == ".github/")["importance"] == "useful", "fixes invalid importance")
    nums = [i["number"] for i in g2["issues"]]
    check(9999 not in nums and 5612 in nums, f"drops hallucinated issue {nums}")
    i5612 = next(i for i in g2["issues"] if i["number"] == 5612)
    check(i5612["skills"] == ["docs"] and i5612["difficulty"] == "easy", "filters skills / lowercases difficulty")
    check(i5612["related_files"] == ["src/flask/app.py"], "keeps only real related files")
    check(i5612["title"].startswith("Docs:"), "title comes from GitHub, not the model")
    check(5590 in nums, "keeps issues the model skipped")
    check(all(g["term"] for g in g2["glossary"]), "drops empty glossary terms")
    check(g2["prerequisites"][1]["link"] == "", "drops invalid link")
    qs = g2["quiz"]
    check(all(0 <= q["answer"] < len(q["options"]) for q in qs), "all quiz answers valid")
    check(not any(q["question"] == "Broken question" for q in qs), "drops broken question")
    tf = next(q for q in qs if q["type"] == "truefalse")
    check(tf["options"] == ["True", "False"] and tf["answer"] == 0, "normalises true/false")
    fill = next(q for q in qs if q["question"].startswith("Format"))
    check("____" in fill["question"] and fill["answer"] == 0, "fixes ___ and string answer")
    types_ = [p["type"] for p in g2["puzzles"]]
    check(types_ == ["find_bug", "predict", "order"], f"puzzles {types_}")
    check(g2["first_contribution"]["issue_number"] == 5612, "first contribution kept")

    # ---- 3. model goes down mid-way
    async def broken(prompt, max_tokens=0):
        raise llm.LLMError("Can't reach the AI model at http://localhost:11434. Is Ollama running?")
    llm.complete_json = broken
    g3, _ = await analyzer.build_guide(b, use_ai=True)
    check(g3["ai"] == "none" and g3["ai_notes"], "falls back cleanly when model is down")

    # ---- 4. JSON extraction from messy model output
    check(llm.extract_json('<think>hmm</think>\n```json\n{"a": [1,2,],}\n```') == {"a": [1, 2]}, "extract_json handles think tags, fences, trailing commas")

    json.dumps(g2)  # must be serialisable
    print("\n" + ("ALL TESTS PASSED" if not check.failed else f"{check.failed} FAILED"))
    with open("tests/sample_ai_guide.json", "w") as f:
        json.dump(g2, f, indent=1)
    with open("tests/sample_basic_guide.json", "w") as f:
        json.dump(g, f, indent=1)

asyncio.run(main())
