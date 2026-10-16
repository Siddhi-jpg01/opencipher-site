"""
Settings, read from environment variables (or a .env file in backend/).
Every value has a sensible default, so the app runs with no .env at all.
"""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # python-dotenv is optional
    pass


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


# ---- GitHub ---------------------------------------------------------------
# Optional. Without a token GitHub allows 60 API calls per hour (~10 repos).
# With a token: 5,000 per hour. Create one at github.com/settings/tokens
# (no scopes needed for public repos).
GITHUB_TOKEN = _env("GITHUB_TOKEN")

# ---- AI model ---------------------------------------------------------------
# LLM_PROVIDER = "ollama"  -> local Ollama (default, fully open-weight, offline)
# LLM_PROVIDER = "openai"  -> any OpenAI-compatible server hosting an
#                             open-weight model (LM Studio, OpenRouter, Groq...)
LLM_PROVIDER = _env("LLM_PROVIDER", "ollama").lower()
OLLAMA_URL = _env("OLLAMA_URL", "http://localhost:11434").rstrip("/")
LLM_MODEL = _env("LLM_MODEL", "qwen3:8b")
LLM_BASE_URL = _env("LLM_BASE_URL", "http://localhost:1234/v1").rstrip("/")
LLM_API_KEY = _env("LLM_API_KEY")
LLM_TIMEOUT = float(_env("LLM_TIMEOUT", "300"))       # seconds per model call
LLM_CONTEXT = int(_env("LLM_CONTEXT", "12288"))        # Ollama context window

# Shown in the UI and README (rule 4.4)
MODEL_DISPLAY_NAME = _env("MODEL_DISPLAY_NAME", "Qwen3-8B")

# ---- Database ---------------------------------------------------------------
# Set MONGODB_URI to use MongoDB Atlas. Leave empty to save to backend/data/.
MONGODB_URI = _env("MONGODB_URI")
MONGODB_DB = _env("MONGODB_DB", "opencipher")
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# A saved guide is reused for this many hours before it is rebuilt.
CACHE_HOURS = float(_env("CACHE_HOURS", "24"))

# ---- Frontend ---------------------------------------------------------------
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
