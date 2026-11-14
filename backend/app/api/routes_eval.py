"""Evaluation dashboard + UI-triggered runner + dataset manager.

- GET  /eval/summary          : aggregated metrics (read-only).
- POST /eval/run              : start the evaluation pipeline in the background.
- GET  /eval/status           : background run progress.
- GET  /eval/dataset          : list labeled evaluation images.
- POST /eval/dataset/items    : upload one image + its ground-truth labels/notes.
- PATCH /eval/dataset/items/{id} : edit labels/notes of one image.
- DELETE /eval/dataset/items/{id} : remove one image and its labels.
- GET  /eval/dataset/image    : serve a dataset image for preview.

Dataset files live under evaluation/data/uploads/ and labels are stored in
evaluation/data/labels/upload_labels.csv — the exact inputs the evaluation
pipeline consumes, so editing them here directly changes what "Run evaluation"
measures.
"""

from __future__ import annotations

import csv
import io
import json
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel

router = APIRouter(tags=["evaluation"])

# backend/app/api/routes_eval.py -> repo root is three parents up.
REPO_ROOT = Path(__file__).resolve().parents[3]
EVAL_ROOT = REPO_ROOT / "evaluation"
EVAL_SUMMARY_PATH = EVAL_ROOT / "results" / "aggregated" / "summary.json"
EVAL_RUNNER = EVAL_ROOT / "scripts" / "run_eval.py"
EVAL_STATUS_PATH = EVAL_ROOT / "results" / "raw" / "eval_run_status.json"
EVAL_DATA_ROOT = EVAL_ROOT / "data"
EVAL_UPLOADS = EVAL_DATA_ROOT / "uploads"
EVAL_LABELS_CSV = EVAL_DATA_ROOT / "labels" / "upload_labels.csv"

CSV_COLUMNS = [
    "case_id",
    "filename",
    "expected_class",
    "expected_category",
    "expected_color",
    "expected_style",
    "expected_formality",
    "expected_gender",
    "notes",
]
EXPECTED_CLASSES = {
    "valid_single",
    "model_worn",
    "multi_item",
    "collage",
    "irrelevant",
    "unreadable",
}
NEGATIVE_CLASSES = {"model_worn", "multi_item", "collage", "irrelevant", "unreadable"}
CATEGORIES = {"top", "bottom", "outerwear", "dress", "shoes", "accessory"}
STYLES = {"casual", "smartCasual", "streetwear", "sporty", "minimal", "formal"}
GENDERS = {"male", "female", "unisex"}
IMAGE_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


def _read_status() -> dict:
    if not EVAL_STATUS_PATH.is_file():
        return {"state": "idle"}
    try:
        return json.loads(EVAL_STATUS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"state": "idle"}


def _read_labels() -> list[dict]:
    if not EVAL_LABELS_CSV.is_file():
        return []
    with EVAL_LABELS_CSV.open("r", encoding="utf-8", newline="") as fh:
        return [
            {key: (value or "").strip() for key, value in row.items()}
            for row in csv.DictReader(fh)
        ]


def _write_labels(rows: list[dict]) -> None:
    EVAL_LABELS_CSV.parent.mkdir(parents=True, exist_ok=True)
    with EVAL_LABELS_CSV.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col, "") for col in CSV_COLUMNS})


def _subdir_for(expected_class: str) -> str:
    return "negative" if expected_class in NEGATIVE_CLASSES else "valid"


def _sniff_image(data: bytes) -> str | None:
    try:
        with Image.open(io.BytesIO(data)) as img:
            fmt = (img.format or "").upper()
            return IMAGE_FORMATS.get(fmt)
    except Exception:  # noqa: BLE001
        return None


def _safe_relative(path: str) -> Path:
    root = EVAL_UPLOADS.resolve()
    candidate = (EVAL_UPLOADS / path).resolve()
    if candidate != root and root not in candidate.parents:
        raise HTTPException(status_code=400, detail="Invalid image path.")
    return candidate


def _to_item(row: dict) -> dict:
    item = dict(row)
    if item.get("expected_formality"):
        try:
            item["expected_formality"] = int(item["expected_formality"])
        except ValueError:
            item["expected_formality"] = None
    else:
        item["expected_formality"] = None
    return item


# --------------------------------------------------------------------------- #
# Dashboard + runner
# --------------------------------------------------------------------------- #

@router.get("/eval/summary")
def eval_summary() -> dict:
    if not EVAL_SUMMARY_PATH.is_file():
        raise HTTPException(
            status_code=404,
            detail="No evaluation summary available. Run the evaluation first.",
        )
    try:
        return json.loads(EVAL_SUMMARY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=502, detail=f"Evaluation summary is invalid: {exc}") from exc


@router.post("/eval/run", status_code=202)
def eval_run() -> dict:
    if _read_status().get("state") == "running":
        raise HTTPException(status_code=409, detail="An evaluation run is already in progress.")
    if not EVAL_RUNNER.is_file():
        raise HTTPException(status_code=501, detail="Evaluation runner script is missing.")

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


# --------------------------------------------------------------------------- #
# Dataset manager
# --------------------------------------------------------------------------- #

@router.get("/eval/dataset")
def eval_dataset() -> dict:
    rows = [_to_item(r) for r in _read_labels()]
    valid = sum(1 for r in rows if r["expected_class"] == "valid_single")
    return {
        "items": rows,
        "counts": {"valid_single": valid, "negative": len(rows) - valid, "total": len(rows)},
    }


@router.post("/eval/dataset/items", status_code=201)
async def eval_dataset_add(
    file: UploadFile = File(...),
    expected_class: str = Form(...),
    expected_category: str | None = Form(None),
    expected_color: str | None = Form(None),
    expected_style: str | None = Form(None),
    expected_formality: str | None = Form(None),
    expected_gender: str | None = Form(None),
    notes: str | None = Form(None),
) -> dict:
    expected_class = (expected_class or "").strip()
    if expected_class not in EXPECTED_CLASSES:
        raise HTTPException(status_code=400, detail="Invalid expected_class.")

    category = (expected_category or "").strip()
    color = (expected_color or "").strip()
    style = (expected_style or "").strip() or "casual"
    gender = (expected_gender or "").strip() or "unisex"
    note = " ".join((notes or "").split()).strip()

    if expected_class == "valid_single":
        if category not in CATEGORIES:
            raise HTTPException(status_code=400, detail="Valid images need a category.")
        if style not in STYLES:
            raise HTTPException(status_code=400, detail="Invalid style.")
        if gender not in GENDERS:
            raise HTTPException(status_code=400, detail="Invalid gender.")
        try:
            formality = int(expected_formality or "50")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Formality must be a number 0–100.") from exc
        formality = max(0, min(100, formality))
    else:
        category = color = ""
        style = ""
        formality = ""
        gender = ""

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    ext = _sniff_image(data)
    if not ext:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, and WebP images are accepted.")

    subdir = _subdir_for(expected_class)
    case_id = f"d-{uuid.uuid4().hex[:8]}"
    filename = f"{case_id}.{ext}"
    dest_dir = EVAL_UPLOADS / subdir
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / filename).write_bytes(data)

    row = {
        "case_id": case_id,
        "filename": f"{subdir}/{filename}",
        "expected_class": expected_class,
        "expected_category": category,
        "expected_color": color,
        "expected_style": style,
        "expected_formality": str(formality) if formality != "" else "",
        "expected_gender": gender,
        "notes": note,
    }
    rows = _read_labels()
    rows.append(row)
    _write_labels(rows)
    return _to_item(row)


class DatasetItemUpdate(BaseModel):
    expected_class: str | None = None
    expected_category: str | None = None
    expected_color: str | None = None
    expected_style: str | None = None
    expected_formality: int | None = None
    expected_gender: str | None = None
    notes: str | None = None


@router.patch("/eval/dataset/items/{case_id}")
def eval_dataset_update(case_id: str, payload: DatasetItemUpdate) -> dict:
    rows = _read_labels()
    index = next((i for i, r in enumerate(rows) if r["case_id"] == case_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Dataset item not found.")

    row = rows[index]
    data = payload.model_dump(exclude_unset=True)

    new_class = (data.get("expected_class") or row["expected_class"]).strip()
    if new_class not in EXPECTED_CLASSES:
        raise HTTPException(status_code=400, detail="Invalid expected_class.")

    for key in ("expected_category", "expected_color", "expected_style", "expected_gender"):
        if key in data:
            row[key] = (data[key] or "").strip()
    if "notes" in data:
        row["notes"] = " ".join((data["notes"] or "").split()).strip()
    if "expected_formality" in data and data["expected_formality"] is not None:
        row["expected_formality"] = str(max(0, min(100, data["expected_formality"])))

    if new_class != row["expected_class"]:
        old_rel = Path(row["filename"])
        new_rel = f"{_subdir_for(new_class)}/{old_rel.name}"
        old_path = _safe_relative(row["filename"])
        new_path = EVAL_UPLOADS / new_rel
        new_path.parent.mkdir(parents=True, exist_ok=True)
        if old_path.is_file():
            shutil.move(str(old_path), str(new_path))
        row["filename"] = new_rel
        row["expected_class"] = new_class

    if new_class != "valid_single":
        row["expected_category"] = ""
        row["expected_style"] = ""
        row["expected_gender"] = ""

    rows[index] = row
    _write_labels(rows)
    return _to_item(row)


@router.delete("/eval/dataset/items/{case_id}", status_code=204)
def eval_dataset_delete(case_id: str) -> None:
    rows = _read_labels()
    index = next((i for i, r in enumerate(rows) if r["case_id"] == case_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Dataset item not found.")
    row = rows.pop(index)
    image_path = _safe_relative(row["filename"])
    if image_path.is_file():
        image_path.unlink(missing_ok=True)
    _write_labels(rows)


@router.get("/eval/dataset/image")
def eval_dataset_image(path: str) -> FileResponse:
    image_path = _safe_relative(path)
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    return FileResponse(image_path)
