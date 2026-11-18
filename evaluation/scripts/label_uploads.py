"""Independent LLM-as-a-judge labelling for the held-out upload set.

Two judges (same vision model, different temperature + prompt wording) label
every image. Disagreements go to a third adjudicator pass. This prompt is
deliberately *not* the product screening prompt in backend/app/services/vlm.py.

Usage:
    backend/.venv/bin/python evaluation/scripts/label_uploads.py
"""

from __future__ import annotations

import base64
import csv
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "backend"))

import common  # noqa: E402
from app.config import settings  # noqa: E402

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-flash"
CLASSES = ("valid_single", "model_worn", "multi_item", "collage", "irrelevant", "unreadable")
CATEGORIES = ("top", "bottom", "outerwear", "dress", "shoes", "accessory")
STYLES = ("casual", "smartCasual", "streetwear", "sporty", "minimal", "formal")
GENDERS = ("male", "female", "unisex")
PINNED_VALID = {
    "valid/outerwear/outerwear-019.jpg",
    "valid/shoes/shoes-018.jpg",
    "valid/accessory/accessory-014.jpg",
}

JUDGE_A_SYSTEM = """You are an independent fashion-dataset annotator, not a product.
Look at the photo and return STRICT JSON only:
{"expected_class":"valid_single|model_worn|multi_item|collage|irrelevant|unreadable","expected_category":"top|bottom|outerwear|dress|shoes|accessory|null","expected_color":"<short English color or null>","expected_style":"casual|smartCasual|streetwear|sporty|minimal|formal|null","expected_formality":0,"expected_gender":"male|female|unisex|null","confidence":0.0,"notes":"<one factual line>"}
Class rules:
- valid_single: exactly one standalone garment or fashion accessory. A matching pair of shoes is one item. A garment on a hanger, flat-lay, or mannequin is valid if it is clearly one item.
- model_worn: a person wearing clothes (full or partial outfit).
- multi_item: two or more separate garments laid out or hanging together, with no person wearing them.
- collage: split, montage, or multi-panel image.
- irrelevant: the primary subject is not clothing (animal, vehicle, food, furniture, scenery).
- unreadable: too blurry, dark, or occluded to identify the subject.
Attribute rules (fill only when expected_class is valid_single; otherwise all attribute fields are null):
- expected_color: dominant colour as a short English name (black, white, gray, navy, blue, beige, brown, red, green, olive, pink, yellow, orange, purple, khaki, cream).
- expected_style: one of the allowed enums.
- expected_formality: integer 0-100. Anchors: 10 athletic/lounge; 30 graphic tee/hoodie/joggers; 45 everyday casual; 60 polished casual; 75 smart-casual shirt/chinos/blazer; 95 suit/evening gown.
- expected_gender: likely intended wearer.
- When uncertain, pick the closest allowed value and say so in notes.
"""

JUDGE_B_SYSTEM = """You label clothing photos for a university research dataset. Reply with JSON only.
Required keys: expected_class, expected_category, expected_color, expected_style, expected_formality, expected_gender, confidence, notes.
expected_class must be one of: valid_single, model_worn, multi_item, collage, irrelevant, unreadable.
valid_single means one isolated clothing item or accessory (a shoe pair counts as one). Reject worn outfits, multi-garment layouts, collages, non-clothing, and unreadable shots.
If and only if the class is valid_single, fill category (top/bottom/outerwear/dress/shoes/accessory), a short colour name, style (casual/smartCasual/streetwear/sporty/minimal/formal), formality 0-100, and gender (male/female/unisex). Otherwise set those fields to null.
Formality anchors: 10 gym/lounge, 30 hoodie/tee, 45 daily casual, 60 neat casual, 75 smart casual, 95 black-tie.
Keep notes to one short sentence.
"""

ADJUDICATOR_SYSTEM = """You are the adjudicator for a clothing-image labelling task.
Two other annotators disagreed. Look at the photo and both labels, then return the final STRICT JSON in the same schema:
{"expected_class":"...","expected_category":"...|null","expected_color":"...|null","expected_style":"...|null","expected_formality":0,"expected_gender":"...|null","confidence":0.0,"notes":"<one line stating which label you kept and why>"}
Prefer the more conservative screening class when the photo is ambiguous (reject rather than accept).
"""

RAW_DIR = common.RESULTS_RAW
JUDGE_A_PATH = RAW_DIR / "judge_a.jsonl"
JUDGE_B_PATH = RAW_DIR / "judge_b.jsonl"
ADJ_PATH = RAW_DIR / "judge_adjudication.jsonl"
AGREE_PATH = common.RESULTS_AGG / "judge_agreement.json"


def _load_env_key() -> str:
    key = (settings.deepseek_api_key or os.environ.get("DEEPSEEK_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")
    return key


def _data_url(path: Path, max_side: int = 1024) -> str:
    with Image.open(path) as img:
        img = img.convert("RGB")
        img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _extract_json(text: str) -> dict:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        cleaned = cleaned.rsplit("```", 1)[0]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError(f"No JSON in response: {cleaned[:200]}")
    return json.loads(cleaned[start : end + 1])


def _norm_class(value: object) -> str | None:
    text = str(value or "").strip()
    return text if text in CLASSES else None


def _norm_category(value: object) -> str | None:
    text = str(value or "").strip().lower()
    aliases = {"tops": "top", "bottoms": "bottom", "pants": "bottom", "jacket": "outerwear", "coat": "outerwear"}
    text = aliases.get(text, text)
    return text if text in CATEGORIES else None


def _norm_style(value: object) -> str | None:
    text = str(value or "").strip()
    aliases = {
        "smart-casual": "smartCasual",
        "smart_casual": "smartCasual",
        "street": "streetwear",
        "sport": "sporty",
        "athletic": "sporty",
    }
    text = aliases.get(text, text)
    return text if text in STYLES else None


def _norm_gender(value: object) -> str | None:
    text = str(value or "").strip().lower()
    return text if text in GENDERS else None


def _norm_color(value: object) -> str | None:
    text = str(value or "").strip().lower()
    if not text or text in {"null", "none", "n/a"}:
        return None
    return text.split(",")[0].split("/")[0].strip()


def _norm_formality(value: object) -> int | None:
    if value is None or value == "" or str(value).lower() in {"null", "none"}:
        return None
    try:
        return max(0, min(100, int(round(float(value)))))
    except (TypeError, ValueError):
        return None


def normalize_label(raw: dict) -> dict:
    cls = _norm_class(raw.get("expected_class"))
    if cls != "valid_single":
        return {
            "expected_class": cls or "unreadable",
            "expected_category": None,
            "expected_color": None,
            "expected_style": None,
            "expected_formality": None,
            "expected_gender": None,
            "confidence": raw.get("confidence"),
            "notes": str(raw.get("notes") or "").strip(),
        }
    return {
        "expected_class": "valid_single",
        "expected_category": _norm_category(raw.get("expected_category")),
        "expected_color": _norm_color(raw.get("expected_color")),
        "expected_style": _norm_style(raw.get("expected_style")),
        "expected_formality": _norm_formality(raw.get("expected_formality")),
        "expected_gender": _norm_gender(raw.get("expected_gender")),
        "confidence": raw.get("confidence"),
        "notes": str(raw.get("notes") or "").strip(),
    }


def call_judge(path: Path, system: str, user_text: str, temperature: float) -> dict:
    api_key = _load_env_key()
    body = {
        "model": DEEPSEEK_MODEL,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": _data_url(path)}},
                ],
            },
        ],
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    last_exc: Exception | None = None
    for attempt in range(4):
        try:
            with httpx.Client(timeout=90.0) as client:
                response = client.post(DEEPSEEK_URL, headers=headers, json=body)
            if response.status_code in {429, 500, 502, 503}:
                time.sleep(2.0 * (attempt + 1))
                last_exc = RuntimeError(f"HTTP {response.status_code}")
                continue
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            parsed = _extract_json(content if isinstance(content, str) else json.dumps(content))
            return normalize_label(parsed)
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            time.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f"judge failed for {path.name}: {last_exc}")


def load_done(path: Path) -> dict[str, dict]:
    done: dict[str, dict] = {}
    for row in common.load_jsonl(path):
        cid = row.get("case_id")
        if cid:
            done[cid] = row
    return done


def append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def run_judge(name: str, system: str, temperature: float, out_path: Path, rows: list[dict], uploads: Path) -> dict[str, dict]:
    done = load_done(out_path)
    pending = [row for row in rows if row["case_id"] not in done]
    print(f"{name}: {len(done)} already labelled, {len(pending)} remaining")
    if not pending:
        return done

    def work(row: dict) -> dict:
        image = uploads / row["filename"]
        label = call_judge(
            image,
            system,
            f"Label this photo. Filename hint (do not trust blindly): {row['filename']}",
            temperature,
        )
        record = {
            "case_id": row["case_id"],
            "filename": row["filename"],
            "judge": name,
            "folder_class": row.get("expected_class"),
            "folder_category": row.get("expected_category") or None,
            **label,
            "recorded_at": common.now_iso(),
        }
        return record

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(work, row): row for row in pending}
        for i, fut in enumerate(as_completed(futures), 1):
            row = futures[fut]
            try:
                record = fut.result()
            except Exception as exc:  # noqa: BLE001
                print(f"  ! {row['case_id']} failed: {exc}")
                continue
            append_jsonl(out_path, record)
            done[record["case_id"]] = record
            print(f"  [{i}/{len(pending)}] {record['case_id']} -> {record['expected_class']} {record.get('expected_category') or ''}")
    return done


def labels_conflict(a: dict, b: dict) -> bool:
    if a.get("expected_class") != b.get("expected_class"):
        return True
    if a.get("expected_class") != "valid_single":
        return False
    if a.get("expected_category") != b.get("expected_category"):
        return True
    if a.get("expected_style") != b.get("expected_style"):
        return True
    if a.get("expected_gender") != b.get("expected_gender"):
        return True
    color_a = common_normalize_color(a.get("expected_color"))
    color_b = common_normalize_color(b.get("expected_color"))
    if color_a != color_b:
        return True
    fa, fb = a.get("expected_formality"), b.get("expected_formality")
    if fa is None or fb is None:
        return fa != fb
    return abs(int(fa) - int(fb)) > 15


COLOR_SYNONYMS = {
    "grey": "gray",
    "charcoal": "gray",
    "denim": "blue",
    "navy": "navy",
    "offwhite": "white",
    "off-white": "white",
    "cream": "beige",
    "ivory": "beige",
    "stone": "beige",
    "nude": "beige",
    "tan": "brown",
    "camel": "brown",
    "maroon": "red",
    "burgundy": "red",
}


def common_normalize_color(value: object) -> str:
    text = "".join(ch for ch in str(value or "").lower() if ch.isalpha())
    return COLOR_SYNONYMS.get(text, text or "unknown")


def cohen_kappa(pairs: list[tuple[str, str]]) -> float | None:
    if not pairs:
        return None
    n = len(pairs)
    labels = sorted({x for pair in pairs for x in pair})
    po = sum(1 for a, b in pairs if a == b) / n
    count_a = {lab: 0 for lab in labels}
    count_b = {lab: 0 for lab in labels}
    for a, b in pairs:
        count_a[a] += 1
        count_b[b] += 1
    pe = sum((count_a[lab] / n) * (count_b[lab] / n) for lab in labels)
    if abs(1 - pe) < 1e-12:
        return 1.0 if po == 1 else 0.0
    return (po - pe) / (1 - pe)


def pin_if_needed(filename: str, label: dict, folder_category: str | None) -> dict:
    if filename not in PINNED_VALID:
        return label
    pinned = dict(label)
    pinned["expected_class"] = "valid_single"
    if not pinned.get("expected_category"):
        pinned["expected_category"] = folder_category
    note = (pinned.get("notes") or "").strip()
    extra = "PINNED as hard valid_single per evaluation protocol"
    pinned["notes"] = f"{note} | {extra}" if note else extra
    return pinned


def write_csv(rows: list[dict], a_map: dict[str, dict], b_map: dict[str, dict], adj_map: dict[str, dict], path: Path) -> None:
    fieldnames = [
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
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            cid = row["case_id"]
            chosen = adj_map.get(cid) or a_map.get(cid) or {}
            chosen = pin_if_needed(row["filename"], chosen, row.get("expected_category") or None)
            note_bits = [chosen.get("notes") or "", row.get("notes") or ""]
            if cid in adj_map:
                note_bits.append("adjudicated")
            writer.writerow(
                {
                    "case_id": cid,
                    "filename": row["filename"],
                    "expected_class": chosen.get("expected_class") or row.get("expected_class"),
                    "expected_category": chosen.get("expected_category") or "",
                    "expected_color": chosen.get("expected_color") or "",
                    "expected_style": chosen.get("expected_style") or "",
                    "expected_formality": chosen.get("expected_formality") if chosen.get("expected_formality") is not None else "",
                    "expected_gender": chosen.get("expected_gender") or "",
                    "notes": " | ".join(bit for bit in note_bits if bit),
                }
            )


def main() -> None:
    rows = common.load_labels()
    if not rows:
        print("No labels CSV found")
        sys.exit(1)
    uploads = common.UPLOADS_DIR
    sys.path.insert(0, str(Path(__file__).resolve().parent))

    a_map = run_judge("judge_a", JUDGE_A_SYSTEM, 0.0, JUDGE_A_PATH, rows, uploads)
    b_map = run_judge("judge_b", JUDGE_B_SYSTEM, 0.7, JUDGE_B_PATH, rows, uploads)

    conflicts: list[dict] = []
    for row in rows:
        cid = row["case_id"]
        a, b = a_map.get(cid), b_map.get(cid)
        if not a or not b:
            print(f"  ! missing judge output for {cid}")
            continue
        if labels_conflict(a, b):
            conflicts.append(row)
    print(f"Conflicts to adjudicate: {len(conflicts)}")

    adj_done = load_done(ADJ_PATH)
    pending = [row for row in conflicts if row["case_id"] not in adj_done]

    def adjudicate(row: dict) -> dict:
        a = a_map[row["case_id"]]
        b = b_map[row["case_id"]]
        user = (
            "Annotator A: "
            + json.dumps({k: a.get(k) for k in ("expected_class", "expected_category", "expected_color", "expected_style", "expected_formality", "expected_gender", "notes")})
            + "\nAnnotator B: "
            + json.dumps({k: b.get(k) for k in ("expected_class", "expected_category", "expected_color", "expected_style", "expected_formality", "expected_gender", "notes")})
            + "\nChoose the final label."
        )
        label = call_judge(uploads / row["filename"], ADJUDICATOR_SYSTEM, user, 0.0)
        record = {
            "case_id": row["case_id"],
            "filename": row["filename"],
            "judge": "adjudicator",
            **label,
            "recorded_at": common.now_iso(),
        }
        return record

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(adjudicate, row): row for row in pending}
        for i, fut in enumerate(as_completed(futures), 1):
            row = futures[fut]
            try:
                record = fut.result()
            except Exception as exc:  # noqa: BLE001
                print(f"  ! adjudication failed {row['case_id']}: {exc}")
                continue
            append_jsonl(ADJ_PATH, record)
            adj_done[record["case_id"]] = record
            print(f"  adj [{i}/{len(pending)}] {record['case_id']} -> {record['expected_class']}")

    # Prefer A when they agree; adjudicator when they do not.
    final_map: dict[str, dict] = {}
    for row in rows:
        cid = row["case_id"]
        a, b = a_map.get(cid), b_map.get(cid)
        if a and b and not labels_conflict(a, b):
            final_map[cid] = a
        elif cid in adj_done:
            final_map[cid] = adj_done[cid]
        elif a:
            final_map[cid] = a

    write_csv(rows, a_map, b_map, final_map, common.LABELS_CSV)

    class_pairs = []
    cat_pairs = []
    style_pairs = []
    gender_pairs = []
    color_pairs = []
    form_a: list[float] = []
    form_b: list[float] = []
    for row in rows:
        a, b = a_map.get(row["case_id"]), b_map.get(row["case_id"])
        if not a or not b:
            continue
        class_pairs.append((str(a.get("expected_class")), str(b.get("expected_class"))))
        if a.get("expected_class") == "valid_single" and b.get("expected_class") == "valid_single":
            cat_pairs.append((str(a.get("expected_category")), str(b.get("expected_category"))))
            style_pairs.append((str(a.get("expected_style")), str(b.get("expected_style"))))
            gender_pairs.append((str(a.get("expected_gender")), str(b.get("expected_gender"))))
            color_pairs.append((common_normalize_color(a.get("expected_color")), common_normalize_color(b.get("expected_color"))))
            if a.get("expected_formality") is not None and b.get("expected_formality") is not None:
                form_a.append(float(a["expected_formality"]))
                form_b.append(float(b["expected_formality"]))

    form_mae = None
    if form_a:
        form_mae = round(sum(abs(x - y) for x, y in zip(form_a, form_b)) / len(form_a), 2)

    agreement = {
        "n_images": len(rows),
        "n_conflicts": len(conflicts),
        "class_raw_agreement": round(sum(1 for a, b in class_pairs if a == b) / len(class_pairs), 4) if class_pairs else None,
        "class_cohen_kappa": round(cohen_kappa(class_pairs) or 0.0, 4) if class_pairs else None,
        "category_cohen_kappa": round(cohen_kappa(cat_pairs) or 0.0, 4) if cat_pairs else None,
        "style_cohen_kappa": round(cohen_kappa(style_pairs) or 0.0, 4) if style_pairs else None,
        "gender_cohen_kappa": round(cohen_kappa(gender_pairs) or 0.0, 4) if gender_pairs else None,
        "color_raw_agreement": round(sum(1 for a, b in color_pairs if a == b) / len(color_pairs), 4) if color_pairs else None,
        "formality_mae_between_judges": form_mae,
        "generated_at": common.now_iso(),
    }
    AGREE_PATH.parent.mkdir(parents=True, exist_ok=True)
    AGREE_PATH.write_text(json.dumps(agreement, indent=2), encoding="utf-8")
    print(json.dumps(agreement, indent=2))
    print(f"Wrote labels to {common.LABELS_CSV}")


if __name__ == "__main__":
    main()
