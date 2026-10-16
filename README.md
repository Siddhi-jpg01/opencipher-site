# OpenCipher

**Every codebase has a way in.**

Paste any public GitHub repository. OpenCipher reads its README, file tree, dependency files, open issues and CONTRIBUTING.md, then uses an open-weight AI model to walk a newcomer through four plain-English steps:

1. **What it is:** the project explained simply, the one file to read first, a beginner-friendliness score, a glowing map of the code, a chat that answers questions about the repo, and every technical word explained on hover
2. **Set it up:** what to install, and the exact commands to copy, in order
3. **Pick a task:** a recommended beginner issue, a seven-step checklist to a finished pull request, and other issues ranked against what you already know
4. **Play & earn:** an arcade of mini-games generated from the real repo:
   - **Code Quiz:** questions, find-the-bug, predict-the-output and put-in-order puzzles, with hearts and streak bonuses
   - **Star Match:** a memory game pairing each folder with what it does
   - **Jargon Rush:** a 45-second speed round matching tech words to their meanings
   - **Command Builder:** rebuild the project's real setup commands piece by piece

**Gamification is built in everywhere.** Every step earns XP. Learners climb six space ranks (Stardust → Comet → Planet → Star → Supernova → Black Hole) with a level-up celebration, keep a daily streak, and collect nine badges. High-score games only pay XP for beating your own best, so XP can't be farmed.

The home page renders a real-time, light-bending black hole on the GPU (WebGL ray marching), and analysing a repository pulls you into it.

Team OpenCipher (Onkar Deshpande, Shriniwas Joshi, Siddhi Basarkar, Purva Chaudhari). OpenForge Hackathon 2026, Track 1, PS04 OpenSource Onboard.

---

## AI model (rule 4.4)

| | |
|---|---|
| Model | **Qwen3-8B** by the Qwen team (Alibaba Cloud) |
| Parameters | **8.2 billion** (a small language model under this challenge's 10B definition) |
| Weights | Open weight: https://huggingface.co/Qwen/Qwen3-8B |
| Licence | **Apache License 2.0**: https://huggingface.co/Qwen/Qwen3-8B/blob/main/LICENSE |
| How we run it | Locally with [Ollama](https://ollama.com) (`qwen3:8b`) |

The model is the core of the product. It writes the plain-language overview, setup steps, code map, issue explanations, glossary, quizzes and code puzzles, and answers repo chat questions. **No closed or proprietary AI API is used anywhere.**

If the model isn't running, OpenCipher still builds a basic guide from repository data alone and labels it clearly as "Built without the AI model". It never shows made-up AI output.

---

## Run it (about 10 minutes the first time)

### 1. Install these once

- **Python 3.10+**: https://www.python.org/downloads/ (on Windows tick **"Add python.exe to PATH"**)
- **Ollama**: https://ollama.com/download

### 2. Download the model (about 5 GB, one time)

Open a terminal (Windows: PowerShell) and run:

```bash
ollama pull qwen3:8b
```

Ollama runs in the background after installation. On a laptop with 16 GB RAM it works on the CPU, and much faster with a GPU.

### 3. Start OpenCipher

- **Windows:** double-click `run.bat`
- **macOS / Linux:** in a terminal run `./run.sh`

The first run installs the Python packages. Your browser then opens **http://localhost:8000**. That's the whole website, frontend and backend together.

To start it by hand instead:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

### 4. Optional settings: `backend/.env`

`run.bat` / `run.sh` create this file from `.env.example`. Everything in it is optional.

| Setting | Why |
|---|---|
| `GITHUB_TOKEN` | Without one, GitHub allows about 10 repositories per hour. Create a token at https://github.com/settings/tokens (classic, **no scopes** needed). **Do this before the demo.** |
| `MONGODB_URI` | Your MongoDB Atlas connection string. Empty = guides are saved as files in `backend/data/`. |
| `LLM_PROVIDER=openai`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Use LM Studio or any OpenAI-compatible server hosting an **open-weight** model instead of Ollama. |

Restart after changing `.env`.

---

## How it works

```
Browser (HTML/CSS/JS)
   │  POST /api/analyze  {"repo": "pallets/flask"}  → job id
   │  GET  /api/jobs/{id}   (polled; drives the live progress log)
   ▼
FastAPI backend
   1. GitHub REST API + raw files: metadata, README, file tree, dependency files,
      CONTRIBUTING.md, up to 15 open issues (good-first-issue first), one small source file
   2. Readiness score computed from the data (README, CONTRIBUTING, beginner issues,
      dependency file, licence, recent activity)
   3. Qwen3-8B, three focused prompts: overview → code map + issues → practice
   4. Every model answer is checked against the real repository: invented file paths
      and issue numbers are dropped, quiz answers are validated, and any section the
      model gets wrong falls back to data-based content
   5. Saved to MongoDB Atlas (or local files) and reused for 24 hours
```

Repo chat (`POST /api/ask`) sends the guide, the file list, and README and CONTRIBUTING excerpts to the model as context. Without the model it does an honest keyword search and says so.

### API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | Model reachable? Which database? |
| POST | `/api/analyze` | `{"repo", "level": "beginner|intermediate|advanced", "refresh"}` → `{"status", "job_id"}` or `{"status": "done", "guide_id"}` if cached |
| GET | `/api/jobs/{id}` | `{"status", "stage", "done", "guide_id", "error"}` |
| GET | `/api/guides` | Recently built guides |
| GET | `/api/guides/{id}` | The full guide JSON |
| POST | `/api/ask` | `{"guide_id", "question", "history"}` → `{"answer", "ai"}` |
| GET/POST | `/api/progress` | Learner progress (checklist, XP, badges) |

Interactive API docs: http://localhost:8000/docs

---

## Project structure

```
opencipher/
├── run.bat / run.sh         one-click start
├── backend/
│   ├── app/
│   │   ├── main.py          FastAPI routes, background jobs, serves the website
│   │   ├── github.py        everything read from GitHub
│   │   ├── llm.py           Ollama / OpenAI-compatible client, JSON repair
│   │   ├── prompts.py       the three model prompts + chat prompt
│   │   ├── analyzer.py      builds the guide, validates every model answer
│   │   ├── heuristics.py    readiness score + data-only fallback guide
│   │   ├── store.py         MongoDB Atlas or local JSON files
│   │   └── config.py        settings from .env
│   ├── tests/               offline tests (python -m tests.test_analyzer)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── index.html           home: black hole, project input, live progress
    ├── dashboard.html       step 1, What it is
    ├── setup.html           step 2, Set it up
    ├── tasks.html           step 3, Pick a task
    ├── arcade.html          step 4, Play & earn (hub + Star Match, Jargon Rush, Command Builder)
    ├── quiz.html            Code Quiz (part of the arcade)
    ├── css/                 style.css (shared) + home.css, pages.css, arcade.css, quiz.css
    └── js/
        ├── common.js        backend calls, storage, top bar, helpers
        ├── space.js         the WebGL black hole + starfield
        ├── constellation.js the glowing code map
        └── home.js, dashboard.js, setup.js, tasks.js, arcade.js, quiz.js
```

## Tests

```bash
cd backend
python -m tests.test_analyzer
```

34 checks run with no network and no model. A simulated model makes typical small-model mistakes (invented files and issues, wrong answer formats, broken JSON), and the tests confirm none of them reach the user.

## Demo-day checklist

- [ ] `ollama pull qwen3:8b` done, and the Ollama app is running
- [ ] `GITHUB_TOKEN` set in `backend/.env`
- [ ] Build guides for 2–3 demo repos the night before (they're cached, so the demo is instant)
- [ ] Laptop plugged in (the model is much faster on mains power)
- [ ] Backup: `http://localhost:8000/dashboard.html?id=sample` works even with no internet
- [ ] Use Chrome or Edge; the black hole needs WebGL (every modern browser has it)

## Licence

MIT. See [LICENSE](LICENSE).
