"""Orchestrate the full evaluation pipeline end-to-end.

Starts an isolated backend instance, runs every measurement script against it,
aggregates, and generates the report. Designed to be invoked by the web UI
(POST /api/eval/run) or directly from the command line.

Usage:
    backend/.venv/bin/python evaluation/scripts/run_eval.py [--reps N] [--tryon-reps N]

Progress is written to evaluation/results/raw/eval_run_status.json so the UI
can poll it.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

EVAL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = EVAL_ROOT.parent
BACKEND_ROOT = REPO_ROOT / "backend"
SCRIPTS = EVAL_ROOT / "scripts"
PYTHON = BACKEND_ROOT / ".venv" / "bin" / "python"
PORT = 8000
BASE_URL = f"http://127.0.0.1:{PORT}"
STATUS_PATH = EVAL_ROOT / "results" / "raw" / "eval_run_status.json"
LOG_PATH = EVAL_ROOT / "results" / "raw" / "eval_run.log"

sys.path.insert(0, str(SCRIPTS))
import common  # noqa: E402


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_status(state: str, step: str, **extra) -> None:
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "state": state,
        "step": step,
        "updated_at": now(),
    }
    record.update(extra)
    STATUS_PATH.write_text(json.dumps(record, indent=2), encoding="utf-8")


def run_script(args: list[str], step: str) -> None:
    write_status("running", step)
    env = {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        "USTYLE_BASE_URL": BASE_URL,
    }
    cmd = [str(PYTHON), *args]
    with LOG_PATH.open("a", encoding="utf-8") as log:
        log.write(f"\n=== {step} === {now()}\n")
        log.flush()
        result = subprocess.run(cmd, cwd=str(REPO_ROOT), env=env, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode != 0:
        write_status("error", step, error=f"{step} exited with code {result.returncode}", log_path=str(LOG_PATH))
        sys.exit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reps", type=int, default=30)
    parser.add_argument("--tryon-reps", type=int, default=5)
    args = parser.parse_args()

    write_status("running", "starting_server", started_at=now(), log_path=str(LOG_PATH))

    # Decide which dataset to use: real labels if present, otherwise a synthetic
    # smoke set so the button still works out of the box.
    real_labels = common.LABELS_CSV
    has_real_data = real_labels.is_file() and sum(1 for _ in real_labels.open(encoding="utf-8")) > 1
    if has_real_data:
        data_root = common.DATA_DIR
        used_smoke_data = False
    else:
        run_script(
            [str(SCRIPTS / "make_smoke_set.py")],
            "generating_synthetic_data",
        )
        data_root = common.RUNTIME_DIR / "smoke"
        used_smoke_data = True

    write_status("running", "starting_server", data_root=str(data_root), used_smoke_data=used_smoke_data)

    server = subprocess.Popen(
        [str(PYTHON), str(SCRIPTS / "run_server.py"), str(PORT)],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        ready = False
        for _ in range(60):
            try:
                if httpx.get(f"{BASE_URL}/api/health", timeout=2.0).status_code == 200:
                    ready = True
                    break
            except Exception:  # noqa: BLE001
                time.sleep(1.0)
        if not ready:
            write_status("error", "starting_server", error="Isolated backend did not become healthy")
            sys.exit(1)

        root = [f"--data-root", str(data_root)]
        run_script([str(SCRIPTS / "run_upload.py"), *root], "upload_screening")
        run_script([str(SCRIPTS / "run_recommend.py"), *root], "recommendation_ablation")
        run_script(
            [str(SCRIPTS / "run_latency.py"), *root, "--reps", str(args.reps), "--tryon-reps", str(args.tryon_reps)],
            "latency",
        )
        run_script([str(SCRIPTS / "run_functional.py"), *root], "functional_matrix")
        run_script([str(SCRIPTS / "analyze.py")], "aggregating")
        run_script([str(SCRIPTS / "report.py")], "generating_report")

        write_status(
            "done",
            "finished",
            finished_at=now(),
            data_root=str(data_root),
            used_smoke_data=used_smoke_data,
            summary_path=str(common.RESULTS_AGG / "summary.json"),
            report_md=str(common.REPORT_DIR / "REPORT.md"),
            report_html=str(common.REPORT_DIR / "index.html"),
        )
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    main()
