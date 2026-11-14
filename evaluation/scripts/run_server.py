"""Launch an isolated USTyle backend for evaluation.

Uses a separate SQLite DB and uploads directory under evaluation/runtime/ so
experiments never touch the real app data. API keys still load from
backend/.env (or the process environment); secrets are never printed.

Usage:
    backend/.venv/bin/python evaluation/scripts/run_server.py [port]

The default port is 8000 (the eval scripts default to http://127.0.0.1:8000).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

EVAL_ROOT = Path(__file__).resolve().parent.parent
BACKEND_ROOT = EVAL_ROOT.parent / "backend"
RUNTIME_DIR = EVAL_ROOT / "runtime"

sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("USTYLE_DB_PATH", str(RUNTIME_DIR / "eval.db"))
os.environ.setdefault("USTYLE_UPLOADS_DIR", str(RUNTIME_DIR / "uploads"))
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("USTYLE_EVAL_PORT", "8000"))

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=False)
