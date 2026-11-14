"""Read-only evaluation dashboard endpoints + UI-triggered evaluation runner.

- GET  /eval/summary : serve aggregated metrics (no writes, no secrets).
- POST /eval/run     : start the evaluation pipeline in the background.
- GET  /eval/status  : report the background run's progress.

The runner executes `evaluation/scripts/run_eval.py`, which spins up an isolated
backend instance so the real wardrobe/profile data is never touched.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["evaluation"])

# backend/app/api/routes_eval.py -> repo root is three parents up.
REPO_ROOT = Path(__file__).resolve().parents[3]
EVAL_ROOT = REPO_ROOT / "evaluation"
EVAL_SUMMARY_PATH = EVAL_ROOT / "results" / "aggregated" / "summary.json"
EVAL_RUNNER = EVAL_ROOT / "scripts" / "run_eval.py"
EVAL_STATUS_PATH = EVAL_ROOT / "results" / "raw" / "eval_run_status.json"


def _read_status() -> dict:
    if not EVAL_STATUS_PATH.is_file():
        return {"state": "idle"}
    try:
        return json.loads(EVAL_STATUS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"state": "idle"}


@router.get("/eval/summary")
def eval_summary() -> dict:
    if not EVAL_SUMMARY_PATH.is_file():
        raise HTTPException(
            status_code=404,
            detail="No evaluation summary available. Run evaluation/scripts/analyze.py first.",
        )
    try:
        return json.loads(EVAL_SUMMARY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=502, detail=f"Evaluation summary is invalid: {exc}") from exc


@router.post("/eval/run", status_code=202)
def eval_run() -> dict:
    status = _read_status()
    if status.get("state") == "running":
        raise HTTPException(status_code=409, detail="An evaluation run is already in progress.")

    if not EVAL_RUNNER.is_file():
        raise HTTPException(status_code=501, detail="Evaluation runner script is missing.")

    # Reset the status file so the previous run's fields don't leak into the UI.
    EVAL_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVAL_STATUS_PATH.write_text(
        json.dumps({"state": "running", "step": "starting", "updated_at": ""}, indent=2),
        encoding="utf-8",
    )

    subprocess.Popen(
        [sys.executable, str(EVAL_RUNNER)],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return {"state": "running"}


@router.get("/eval/status")
def eval_status() -> dict:
    return _read_status()
