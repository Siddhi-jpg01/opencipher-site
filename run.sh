#!/usr/bin/env bash
# OpenCipher - one-command start for macOS / Linux:  ./run.sh
set -e
cd "$(dirname "$0")/backend"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
[ -f .env ] || cp .env.example .env
echo ""
echo "  OpenCipher is starting at http://localhost:8000  (Ctrl+C to stop)"
echo ""
( sleep 2; (command -v open >/dev/null && open http://localhost:8000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8000) ) >/dev/null 2>&1 &
python -m uvicorn app.main:app --port 8000
