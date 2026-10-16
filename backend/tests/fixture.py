"""A realistic GitHub bundle (shaped like pallets/flask) for offline tests."""
README = """# Flask

Flask is a lightweight [WSGI] web application framework. It is designed
to make getting started quick and easy, with the ability to scale up to
complex applications. It began as a simple wrapper around Werkzeug
and Jinja, and has become one of the most popular Python web
application frameworks.

Flask offers suggestions, but doesn't enforce any dependencies or
project layout. It is up to the developer to choose the tools and
libraries they want to use. There are many extensions provided by the
community that make adding new functionality easy.

## A Simple Example

```python
from flask import Flask

app = Flask(__name__)

@app.route("/")
def hello():
    return "Hello, World!"
```

## Donate

The Pallets organization develops and supports Flask and the libraries
it uses. In order to grow the community of contributors and users, and
allow the maintainers to devote more time to the projects, please donate today.
""" * 2

CONTRIBUTING = """# How to contribute to Flask

Thank you for considering contributing to Flask!

## Submitting patches

- Use Black to format your code. This and other tools will run automatically if you install pre-commit.
- Include tests if your patch adds or changes code. Make sure the test fails without your patch.
- Update any relevant docs pages and docstrings. Docs pages and docstrings should be wrapped at 72 characters.
- Add an entry in CHANGES.rst. Use the same style as other entries.
- Create a branch to identify the issue you would like to work on.
"""

PYPROJECT = """[project]
name = "Flask"
requires-python = ">=3.9"
dependencies = ["Werkzeug>=3.1", "Jinja2>=3.1.2", "itsdangerous>=2.2", "click>=8.1.3", "blinker>=1.9"]

[project.optional-dependencies]
dev = ["pytest", "pre-commit", "tox"]
"""

TREE_PATHS = [
    ("src", "tree"), ("src/flask", "tree"), ("src/flask/__init__.py", "blob"), ("src/flask/app.py", "blob"),
    ("src/flask/helpers.py", "blob"), ("src/flask/cli.py", "blob"), ("src/flask/json", "tree"),
    ("tests", "tree"), ("tests/test_basic.py", "blob"), ("tests/test_cli.py", "blob"),
    ("docs", "tree"), ("docs/index.rst", "blob"), ("docs/tutorial", "tree"), ("examples", "tree"),
    ("examples/tutorial", "tree"), (".github", "tree"), (".github/workflows", "tree"), (".github/workflows/tests.yaml", "blob"),
    ("README.md", "blob"), ("CONTRIBUTING.md", "blob"), ("pyproject.toml", "blob"), ("LICENSE.txt", "blob"),
    ("CHANGES.rst", "blob"), ("requirements", "tree"), ("requirements/dev.txt", "blob"),
]

SAMPLE = '''def get_debug_flag() -> bool:
    """Get whether debug mode should be enabled for the app, indicated by the
    :envvar:`FLASK_DEBUG` environment variable. The default is ``False``.
    """
    val = os.environ.get("FLASK_DEBUG")
    return bool(val and val.lower() not in {"0", "false", "no"})


def get_load_dotenv(default: bool = True) -> bool:
    val = os.environ.get("FLASK_SKIP_DOTENV")
    if not val:
        return default
    return val.lower() in ("0", "false", "no")
'''


def bundle():
    return {
        "meta": {"owner": "pallets", "name": "flask", "full_name": "pallets/flask", "url": "https://github.com/pallets/flask",
                 "description": "The Python micro framework for building web applications.", "stars": 69000, "forks": 16300,
                 "open_issues": 9, "language": "Python", "license": "BSD-3-Clause", "topics": ["flask", "python", "wsgi"],
                 "updated_at": "2026-10-10T09:00:00Z", "default_branch": "main", "avatar": None, "archived": False},
        "readme": README,
        "tree": [{"path": p, "type": t, "size": 1800 if t == "blob" else None} for p, t in TREE_PATHS],
        "tree_truncated": False,
        "contributing": CONTRIBUTING, "contributing_path": "CONTRIBUTING.md",
        "dep_files": {"pyproject.toml": PYPROJECT},
        "lock_files": [],
        "issues": [
            {"number": 5612, "title": "Docs: clarify app.run debug parameter in quickstart", "url": "https://github.com/pallets/flask/issues/5612",
             "labels": ["docs", "good first issue"], "body": "The quickstart says debug=True but doesn't explain the reloader. See docs/quickstart.rst and app.py.",
             "comments": 1, "assigned": False, "beginner_score": 4},
            {"number": 5590, "title": "Add type hints to helpers.get_flashed_messages", "url": "https://github.com/pallets/flask/issues/5590",
             "labels": ["typing"], "body": "get_flashed_messages in helpers.py is missing precise return types.",
             "comments": 3, "assigned": False, "beginner_score": 0},
            {"number": 5577, "title": "CLI: --env-file error message is confusing", "url": "https://github.com/pallets/flask/issues/5577",
             "labels": ["help wanted", "cli"], "body": "When the file is missing, cli.py raises a stack trace instead of a friendly message.",
             "comments": 2, "assigned": False, "beginner_score": 2},
        ],
        "source_sample": {"path": "src/flask/helpers.py", "text": SAMPLE},
    }


# What a small model might plausibly answer, including typical mistakes
AI_OVERVIEW = {
    "one_liner": "Flask is a small Python framework for building websites and web APIs.",
    "plain_explanation": ["Flask gives you the basics to answer web requests in Python.", "The core lives in src/flask; app.py defines the Flask class."],
    "who_its_for": "Python developers who want a simple web framework.",
    "tech_stack": ["Python", "Werkzeug", "Jinja2", "Click", "pytest"],
    "prerequisites": [{"name": "Python 3.9+", "why": "Flask is Python.", "link": "https://www.python.org/downloads/"},
                      {"name": "Git", "why": "To clone.", "link": "git-scm.com"}],
    "setup_steps": [{"title": "Clone your fork", "detail": "Get the code.", "command": "$ git clone https://github.com/YOUR-USERNAME/flask.git\n$ cd flask"},
                    {"title": "Create a virtual environment", "detail": "Isolate packages.", "command": ["python -m venv .venv", "source .venv/bin/activate"]},
                    {"title": "Install in editable mode", "detail": "Installs Flask and dev tools.", "command": "pip install -r requirements/dev.txt && pip install -e ."},
                    {"title": "Run the tests", "detail": "Make sure all pass.", "command": "pytest"}],
    "glossary": [{"term": "WSGI", "meaning": "The standard way Python web apps talk to web servers."},
                 {"term": "route", "meaning": "A URL that runs a function."}, {"term": "Jinja", "meaning": "Flask's template engine."},
                 {"term": "blueprint", "meaning": "A way to group routes."}, {"term": "", "meaning": "broken"}],
    "contributing_rules": ["Format code with Black.", "Add tests for changes.", "Add an entry to CHANGES.rst."],
}
AI_MAP = {
    "directories": [
        {"path": "src/flask/", "role": "The Flask package itself.", "importance": "core"},
        {"path": "src/flask/app.py", "role": "Defines the Flask application class.", "importance": "core", "start_here": True},
        {"path": "src/flask/routing.py", "role": "HALLUCINATED FILE", "importance": "core"},
        {"path": "tests", "role": "pytest test suite.", "importance": "useful"},
        {"path": "./docs/", "role": "Sphinx documentation.", "importance": "useful"},
        {"path": ".github/", "role": "CI workflows.", "importance": "SKIPPABLE"},
        {"path": "examples/", "role": "Example apps.", "importance": "useful", "start_here": True},
    ],
    "issues": [
        {"number": "#5612", "difficulty": "Easy", "skills": ["docs", "writing"], "explanation": "Explain what debug mode does in the quickstart.",
         "related_files": ["docs/quickstart.rst", "src/flask/app.py"], "estimated_time": "1 hour"},
        {"number": 9999, "difficulty": "easy", "skills": ["python"], "explanation": "HALLUCINATED ISSUE"},
        {"number": 5577, "difficulty": "medium", "skills": ["python"], "explanation": "Show a friendly error when --env-file is missing.",
         "related_files": ["src/flask/cli.py"]},
    ],
    "first_contribution": {"issue_number": 5612, "why": "Docs only, small, and clearly described."},
}
AI_PRACTICE = {
    "quiz": [
        {"type": "mcq", "question": "Where does the Flask class live?", "options": ["src/flask/app.py", "tests/", "docs/", "examples/"], "answer": 0, "explanation": "app.py defines Flask."},
        {"type": "true_false", "question": "You should add tests when you change code.", "options": ["yes", "no"], "answer": True, "explanation": "CONTRIBUTING asks for tests."},
        {"type": "fill", "question": "Format your code with ___ before committing.", "options": ["Black", "Prettier", "gofmt", "rustfmt"], "answer": "Black", "explanation": "Flask uses Black."},
        {"type": "mcq", "question": "Broken question", "options": ["a"], "answer": 0},
        {"type": "mcq", "question": "Which command runs the tests?", "options": ["pytest", "npm test", "cargo test", "make"], "answer": 7},
        {"type": "mcq", "question": "Which file records changes per release?", "options": ["CHANGES.rst", "README.md", "LICENSE.txt", "pyproject.toml"], "answer": "0", "explanation": "CHANGES.rst is the changelog."},
    ],
    "find_bug": {"title": "This should read FLASK_SKIP_DOTENV. Which line has the bug?", "language": "python",
                 "lines": ["def get_load_dotenv(default: bool = True) -> bool:", '    val = os.environ.get("FLASK_SKIP_DOTENV")',
                           "    if val:", "        return default", '    return val.lower() in ("0", "false", "no")'],
                 "bug_line": 2, "explanation": "It should be `if not val:`."},
    "predict": {"title": "Default value", "lines": ['val = None', 'print(bool(val and val.lower() not in {"0"}))'],
                "prompt": "What does this print?", "answers": ["False"], "explanation": "None is falsy."},
}
