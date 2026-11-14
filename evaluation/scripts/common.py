"""Shared helpers for the USTyle evaluation scripts.

Kept dependency-light on purpose: the backend venv already has httpx and the
standard library; no numpy/pandas/matplotlib are required for the harness.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

EVAL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = EVAL_ROOT.parent
DATA_DIR = EVAL_ROOT / "data"
RUNTIME_DIR = EVAL_ROOT / "runtime"
UPLOADS_DIR = DATA_DIR / "uploads"
LABELS_CSV = DATA_DIR / "labels" / "upload_labels.csv"
WARDROBES_DIR = DATA_DIR / "wardrobes"
RESULTS_RAW = EVAL_ROOT / "results" / "raw"
RESULTS_AGG = EVAL_ROOT / "results" / "aggregated"
REPORT_DIR = EVAL_ROOT / "report"

BASE_URL = os.environ.get("USTYLE_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def git_revision() -> str:
    try:
        out = subprocess.check_output(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        return out.strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_jsonl(path: Path, records: list[dict], *, append: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = "a" if append else "w"
    with path.open(mode, encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def load_jsonl(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    records: list[dict] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def load_labels(path: Path | None = None) -> list[dict]:
    path = path or LABELS_CSV
    if not path.is_file():
        return []
    with path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        return [
            {key: (value or "").strip() for key, value in row.items()}
            for row in reader
        ]


def load_wardrobe_manifests(path: Path | None = None) -> list[dict]:
    path = path or WARDROBES_DIR
    manifests: list[dict] = []
    if path.is_file():
        data = json.loads(path.read_text(encoding="utf-8"))
        manifests.extend(data if isinstance(data, list) else [data])
        return manifests
    for manifest_file in sorted(path.glob("*.json")):
        data = json.loads(manifest_file.read_text(encoding="utf-8"))
        manifests.extend(data if isinstance(data, list) else [data])
    return manifests


def base_manifest() -> dict:
    return {
        "git_revision": git_revision(),
        "generated_at": now_iso(),
        "base_url": BASE_URL,
        "deepseek_configured": bool(os.environ.get("DEEPSEEK_API_KEY", "").strip()),
        "kie_configured": bool(os.environ.get("KIE_API_KEY", "").strip()),
        "public_base_url": os.environ.get("PUBLIC_BASE_URL", "").strip() or None,
    }
