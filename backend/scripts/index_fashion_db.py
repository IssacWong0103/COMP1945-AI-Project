#!/usr/bin/env python3
"""Optional offline indexer for Fashion_DB (Uniqlo / Zara folder names).

Does not modify or delete images. Writes app/data/fashion_db_index.json.
Matching already works from the seeded reference_outfits.json.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

REPO_ROOT = BACKEND_ROOT.parent
FASHION_DB = REPO_ROOT / "Fashion_DB"
OUT_PATH = BACKEND_ROOT / "app" / "data" / "fashion_db_index.json"

FOLDER_TO_CATEGORY = {
    "casual": "top",
    "business_smart": "top",
    "outerwear": "outerwear",
    "bottoms": "bottom",
    "formal_dress": "dress",
    "athletic_sport": "top",
    "loungewear": "top",
    "streetwear": "top",
}

FOLDER_TO_STYLE = {
    "casual": "casual",
    "business_smart": "smartCasual",
    "outerwear": "smartCasual",
    "bottoms": "casual",
    "formal_dress": "formal",
    "athletic_sport": "sporty",
    "loungewear": "casual",
    "streetwear": "streetwear",
}

GENDER_RE = re.compile(r"(?:^|_)(men|man|male|women|woman|female|unisex)(?:_|$)", re.I)


def infer_gender(name: str) -> str:
    match = GENDER_RE.search(name.replace("-", "_"))
    if not match:
        return "unisex"
    token = match.group(1).lower()
    if token in {"men", "man", "male"}:
        return "male"
    if token in {"women", "woman", "female"}:
        return "female"
    return "unisex"


def index_brand(brand_dir: Path, brand: str) -> list[dict]:
    rows: list[dict] = []
    if not brand_dir.is_dir():
        return rows
    for folder in sorted(p for p in brand_dir.iterdir() if p.is_dir()):
        folder_key = folder.name.lower()
        category = FOLDER_TO_CATEGORY.get(folder_key, "top")
        style = FOLDER_TO_STYLE.get(folder_key, "casual")
        for image in sorted(folder.glob("*.jpg")) + sorted(folder.glob("*.png")):
            rows.append(
                {
                    "brand": brand,
                    "fashionDbCategory": folder.name,
                    "path": str(image.relative_to(REPO_ROOT)),
                    "file": image.name,
                    "category": category,
                    "style": style,
                    "itemGender": infer_gender(image.name),
                }
            )
    return rows


def main() -> int:
    if not FASHION_DB.is_dir():
        print(f"Fashion_DB not found at {FASHION_DB}", file=sys.stderr)
        return 1
    rows: list[dict] = []
    rows.extend(index_brand(FASHION_DB / "Uniqlo", "Uniqlo"))
    rows.extend(index_brand(FASHION_DB / "Zara", "Zara"))
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} entries to {OUT_PATH.relative_to(BACKEND_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
