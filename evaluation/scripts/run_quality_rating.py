"""Rate real USTyle outputs on a 1–5 quality rubric with an independent AI judge.

Reads the live backend database for outfits that already have a generated
try-on image, builds blind rating prompts (venue + garment list only, no
system scores), shuffles them with a fixed seed, and asks DeepSeek Flash —
acting as an independent judge — to score outfit quality and try-on visual
quality.

Writes:
  - evaluation/results/raw/quality_ratings.csv        (one row per rated item)
  - evaluation/results/aggregated/quality_metrics.json (per-question means)

Usage:
    backend/.venv/bin/python evaluation/scripts/run_quality_rating.py
"""

from __future__ import annotations

import base64
import csv
import json
import os
import random
import re
import sqlite3
import statistics
import sys
from pathlib import Path

import httpx

EVAL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = EVAL_ROOT.parent
BACKEND_ROOT = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

# Prefer the isolated eval DB when it exists so ratings match the held-out run.
os.environ.setdefault("USTYLE_DB_PATH", str(EVAL_ROOT / "runtime" / "eval.db"))
os.environ.setdefault("USTYLE_UPLOADS_DIR", str(EVAL_ROOT / "runtime" / "uploads"))

from app.config import settings  # noqa: E402

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-flash"

OUTFIT_QUESTIONS = [
    ("venue_appropriate", "Venue appropriate"),
    ("visually_cohesive", "Visually cohesive"),
    ("complete", "Complete outfit"),
    ("practical", "Practical to wear"),
]
TRYON_QUESTIONS = [
    ("identity", "Same person"),
    ("proportions", "Natural proportions"),
    ("realism", "Photorealistic"),
    ("artifacts", "No artifacts"),
    ("garments_kept", "Garments kept"),
]

VENUE_LABELS = {
    "lecture": "lecture",
    "careerFair": "career fair",
    "casualDate": "casual date",
    "hallGathering": "hall gathering",
    "formal": "formal event",
}

OUTFIT_SYSTEM = (
    "You are an independent fashion reviewer scoring outfits for a university "
    "campus. Answer in strict JSON with integer fields from 1 to 5 (1 = clearly "
    "wrong, 5 = excellent) and a short 'justification' string."
)
TRYON_SYSTEM = (
    "You are an independent reviewer scoring virtual try-on images for realism. "
    "Answer in strict JSON with integer fields from 1 to 5 (1 = clearly broken, "
    "5 = excellent) and a short 'justification' string."
)


def _extract_json(text: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError(f"No JSON object in response: {text[:200]}")
    return json.loads(cleaned[start : end + 1])


def _data_url(path: Path) -> str:
    raw = path.read_bytes()
    mime = "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def _call(messages: list[dict], *, temperature: float = 0.0) -> dict:
    api_key = settings.deepseek_api_key.strip()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")
    body = {
        "model": DEEPSEEK_MODEL,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": messages,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    with httpx.Client(timeout=60.0) as client:
        response = client.post(DEEPSEEK_URL, headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
    content = data["choices"][0]["message"]["content"]
    return _extract_json(content if isinstance(content, str) else json.dumps(content))


def _clamp(score: object) -> int:
    try:
        return max(1, min(5, int(score)))
    except (TypeError, ValueError):
        return 3


def load_outfits() -> list[dict]:
    db_path = settings.db_path
    if not Path(db_path).is_file():
        return []
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, venue, items_json, try_on_url, try_on_status FROM outfits"
    ).fetchall()
    conn.close()

    outfits = []
    for row in rows:
        try:
            items = json.loads(row["items_json"]).get("items", [])
        except (json.JSONDecodeError, AttributeError):
            items = []
        try_on_path = None
        if row["try_on_url"] and row["try_on_status"] == "ready":
            try_on_rel = (row["try_on_url"] or "").lstrip("/")
            if try_on_rel.startswith("uploads/"):
                try_on_rel = try_on_rel[len("uploads/") :]
            candidate = settings.uploads_dir / try_on_rel
            if candidate.is_file():
                try_on_path = candidate
        outfits.append(
            {
                "id": row["id"],
                "venue": row["venue"],
                "items": items,
                "try_on_path": try_on_path,
            }
        )
    return outfits


def describe_outfit(outfit: dict) -> str:
    venue = VENUE_LABELS.get(outfit["venue"], outfit["venue"])
    parts = [f"Venue: {venue}"]
    for item in outfit["items"]:
        category = item.get("category") or "item"
        color = item.get("color") or "unknown colour"
        desc = (item.get("description") or "").strip()
        parts.append(f"- {category} ({color}): {desc}" if desc else f"- {category} ({color})")
    return "\n".join(parts)


def rate_outfit(outfit: dict, *, temperature: float = 0.0) -> dict:
    prompt = (
        "Score this outfit on a 1-5 scale for each question.\n\n"
        f"{describe_outfit(outfit)}\n\n"
        'Return JSON with keys: "venue_appropriate", "visually_cohesive", '
        '"complete", "practical" (integers 1-5) and "justification" (string).'
    )
    return _call(
        [{"role": "system", "content": OUTFIT_SYSTEM}, {"role": "user", "content": prompt}],
        temperature=temperature,
    )


def rate_tryon(outfit: dict, *, temperature: float = 0.0) -> dict:
    garment_list = "\n".join(
        f"- {item.get('category')} ({item.get('color')})" for item in outfit["items"]
    )
    prompt = (
        "Score this virtual try-on image on a 1-5 scale for each question. "
        "The user's own full-body photo was used as the base.\n\n"
        f"Requested garments:\n{garment_list}\n\n"
        'Return JSON with keys: "identity", "proportions", "realism", "artifacts", '
        '"garments_kept" (integers 1-5) and "justification" (string). For '
        '"artifacts", 5 means no artifacts and 1 means severe artifacts.'
    )
    messages = [
        {"role": "system", "content": TRYON_SYSTEM},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": _data_url(outfit["try_on_path"])}},
            ],
        },
    ]
    return _call(messages, temperature=temperature)


JUDGES = (("judge_a", 0.0), ("judge_b", 0.7))


def main() -> None:
    outfits = load_outfits()
    if not outfits:
        print("No outfits found in the evaluation database.")
        return

    rng = random.Random(0)
    shuffled = list(outfits)
    rng.shuffle(shuffled)
    # Cap outfit ratings so two judges stay affordable; prefer venue diversity.
    shuffled = shuffled[:12]

    rows: list[dict] = []
    failures = 0
    for judge_name, temperature in JUDGES:
        for outfit in shuffled:
            try:
                rating = rate_outfit(outfit, temperature=temperature)
            except Exception as exc:  # noqa: BLE001
                print(f"outfit rating failed for {outfit['id']} ({judge_name}): {exc}")
                failures += 1
                continue
            row = {
                "type": "outfit",
                "item_id": outfit["id"],
                "venue": outfit["venue"],
                "judge": judge_name,
                "justification": str(rating.get("justification") or "").strip(),
            }
            for key, _ in OUTFIT_QUESTIONS:
                row[key] = _clamp(rating.get(key))
            rows.append(row)

            if not outfit.get("try_on_path"):
                continue
            try:
                rating = rate_tryon(outfit, temperature=temperature)
            except Exception as exc:  # noqa: BLE001
                print(f"try-on rating failed for {outfit['id']} ({judge_name}): {exc}")
                failures += 1
                continue
            trow = {
                "type": "tryon",
                "item_id": outfit["id"],
                "venue": outfit["venue"],
                "judge": judge_name,
                "justification": str(rating.get("justification") or "").strip(),
            }
            for key, _ in TRYON_QUESTIONS:
                trow[key] = _clamp(rating.get(key))
            rows.append(trow)

    raw_path = EVAL_ROOT / "results" / "raw" / "quality_ratings.csv"
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    columns = ["type", "item_id", "venue", "judge"] + [k for k, _ in OUTFIT_QUESTIONS] + [k for k, _ in TRYON_QUESTIONS] + ["justification"]
    with raw_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    metrics = {}
    for kind, questions in (("outfit", OUTFIT_QUESTIONS), ("tryon", TRYON_QUESTIONS)):
        subset = [r for r in rows if r["type"] == kind]
        if not subset:
            continue
        question_means = {}
        for key, label in questions:
            values = [r[key] for r in subset if key in r]
            question_means[label] = round(float(statistics.mean(values)), 2) if values else None
        overall = [statistics.mean([r[k] for k, _ in questions if k in r]) for r in subset]
        a_rows = [r for r in subset if r.get("judge") == "judge_a"]
        b_rows = [r for r in subset if r.get("judge") == "judge_b"]
        paired = 0
        agree = 0
        b_by_id = {r["item_id"]: r for r in b_rows}
        for a in a_rows:
            b = b_by_id.get(a["item_id"])
            if not b:
                continue
            for key, _ in questions:
                paired += 1
                if abs(int(a.get(key, 0)) - int(b.get(key, 0))) <= 1:
                    agree += 1
        metrics[kind] = {
            "count": len(subset),
            "n_items": len({r["item_id"] for r in subset}),
            "overall_mean": round(float(statistics.mean(overall)), 2),
            "questions": question_means,
            "judge_agreement_within_1": round(agree / paired, 4) if paired else None,
        }

    agg_path = EVAL_ROOT / "results" / "aggregated" / "quality_metrics.json"
    agg_path.parent.mkdir(parents=True, exist_ok=True)
    agg_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(f"Rated {len(rows)} items ({failures} failed calls).")
    print(f"CSV  -> {raw_path}")
    print(f"JSON -> {agg_path}")


if __name__ == "__main__":
    main()
