# How to run OpenCipher in VS Code

## Just look at the website (nothing to install)
1. In VS Code: **File → Open Folder** → pick `opencipher-site`.
2. In the left panel open `frontend`, right-click `index.html` → **Reveal in File Explorer** (Mac: **Reveal in Finder**), and double-click it.
3. Click **See an example** at the top to walk through all four steps with sample data.

## Run it for real (analyses any GitHub project)
Needs Python, which most laptops already have. Open the terminal in VS Code (**Terminal → New Terminal**) and run one line at a time:

Windows:
```
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

Mac:
```
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --port 8000
```

Then open **http://localhost:8000** in Chrome or Edge.

- Keep the terminal open while you use the site. Press **Ctrl+C** in it to stop.
- Next time, you only need the last line.
- If the AI model isn't installed, guides are still made from the project's real files, and the site says so.
