"""Evaluate upload screening and garment tagging.

POSTs every labeled image to the isolated backend's /api/wardrobe/items and
records the outcome (accepted/rejected/unavailable), the VLM tags, and an
offline heuristic baseline (accept-all screening + _heuristic_tags attributes)
for comparison. Aggregation happens in analyze.py.

Usage:
    backend/.venv/bin/python evaluation/scripts/run_upload.py [--labels path.csv]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from time import perf_counter

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "backend"))

import common  # noqa: E402

try:
    from app.services.vlm import _heuristic_tags  # noqa: F401
    HEURISTIC_AVAILABLE = True
except Exception:  # noqa: BLE001
    HEURISTIC_AVAILABLE = False


def heuristic_baseline(image_path: Path) -> dict:
    if not HEURISTIC_AVAILABLE:
        return {}
    try:
        from app.services.vlm import _heuristic_tags

        return _heuristic_tags(image_path, notes=None, original_name=image_path.name)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def upload_one(client: httpx.Client, image_path: Path, row: dict) -> dict:
    started = perf_counter()
    elapsed_ms = 0.0
    outcome = "error"
    http_status: int | None = None
    detail: str | None = None
    tags: dict = {}
    try:
        with image_path.open("rb") as fh:
            response = client.post(
                f"{common.BASE_URL}/api/wardrobe/items",
                files={"file": (image_path.name, fh, "image/jpeg")},
                timeout=120.0,
            )
        elapsed_ms = (perf_counter() - started) * 1000
        http_status = response.status_code
        if response.status_code == 201:
            outcome = "accepted"
            tags = response.json()
        elif response.status_code == 400:
            outcome = "rejected"
            try:
                detail = response.json().get("detail")
            except Exception:  # noqa: BLE001
                detail = response.text[:240]
        elif response.status_code == 503:
            outcome = "unavailable"
            try:
                detail = response.json().get("detail")
            except Exception:  # noqa: BLE001
                detail = response.text[:240]
        else:
            outcome = "error"
            detail = response.text[:240]
    except Exception as exc:  # noqa: BLE001
        elapsed_ms = (perf_counter() - started) * 1000
        outcome = "error"
        detail = str(exc)

    return {
        "case_id": row["case_id"],
        "filename": row["filename"],
        "expected_class": row["expected_class"],
        "expected_category": row.get("expected_category") or None,
        "expected_color": row.get("expected_color") or None,
        "expected_style": row.get("expected_style") or None,
        "expected_formality": int(row["expected_formality"]) if row.get("expected_formality") else None,
        "expected_gender": row.get("expected_gender") or None,
        "notes": row.get("notes") or None,
        "outcome": outcome,
        "http_status": http_status,
        "error_detail": detail,
        "screening_mode": "vlm",
        "elapsed_ms": round(elapsed_ms, 1),
        "tags": tags if isinstance(tags, dict) else {},
        "heuristic_tags": heuristic_baseline(image_path),
        "recorded_at": common.now_iso(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--labels", default=None)
    parser.add_argument("--data-root", default=str(common.DATA_DIR))
    args = parser.parse_args()

    data_root = Path(args.data_root)
    labels_path = Path(args.labels) if args.labels else data_root / "labels" / "upload_labels.csv"
    uploads_dir = data_root / "uploads"

    rows = common.load_labels(labels_path)
    if not rows:
        print("No label rows found. Generate a smoke set or add labels first.")
        sys.exit(1)

    results: list[dict] = []
    with httpx.Client() as client:
        for row in rows:
            image_path = uploads_dir / row["filename"]
            if not image_path.is_file():
                result = {
                    "case_id": row["case_id"],
                    "filename": row["filename"],
                    "expected_class": row["expected_class"],
                    "outcome": "error",
                    "http_status": None,
                    "error_detail": f"missing file: {image_path}",
                    "screening_mode": "vlm",
                    "elapsed_ms": 0.0,
                    "tags": {},
                    "heuristic_tags": {},
                    "recorded_at": common.now_iso(),
                }
                results.append(result)
                print(f"[{row['case_id']}] missing file: {image_path}")
                continue
            result = upload_one(client, image_path, row)
            results.append(result)
            print(
                f"[{row['case_id']}] {result['outcome']} "
                f"http={result['http_status']} {result['elapsed_ms']:.0f}ms"
            )

    manifest = common.base_manifest()
    manifest["labels_file"] = str(labels_path)
    manifest["data_root"] = str(data_root)
    manifest["heuristic_available"] = HEURISTIC_AVAILABLE
    common.write_jsonl(common.RESULTS_RAW / "upload_results.jsonl", results)
    common.write_jsonl(common.RESULTS_RAW / "upload_manifest.jsonl", [manifest])
    print(f"\nWrote {len(results)} upload results to {common.RESULTS_RAW / 'upload_results.jsonl'}")


if __name__ == "__main__":
    main()
