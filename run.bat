@echo off
REM OpenCipher - one-click start for Windows. Double-click this file.
cd /d "%~dp0backend"
if not exist .venv (
  echo Creating Python environment...
  python -m venv .venv || (echo Python not found. Install it from https://www.python.org/downloads/ and tick "Add to PATH". & pause & exit /b)
)
call .venv\Scripts\activate
echo Installing packages (first run only takes a minute)...
pip install -q -r requirements.txt
if not exist .env copy .env.example .env >nul
echo.
echo  OpenCipher is starting at http://localhost:8000
echo  Keep this window open. Press Ctrl+C to stop.
echo.
start "" http://localhost:8000
python -m uvicorn app.main:app --port 8000
pause
