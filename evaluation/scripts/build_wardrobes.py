"""Build five Tier-1 wardrobe manifests from the labelled held-out set.

Picks distinct valid garments so recommendation cases cover:
  1. complete casual closet
  2. complete smart/formal closet
  3. minimal (tops only)
  4. female/unisex dress closet
  5. clashing-colour closet

Usage:
    backend/.venv/bin/python evaluation/scripts/build_wardrobes.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import common  # noqa: E402

from analyze import normalize_color  # noqa: E402

ALL_VENUES = ["lecture", "careerFair", "casualDate", "hallGathering", "formal"]
SMART = {"smartCasual", "formal", "minimal"}
CASUAL = {"casual", "streetwear", "sporty"}
CLASH_A = {"red", "pink", "orange"}
CLASH_B = {"green", "olive", "teal"}


def item_entry(row: dict) -> dict:
    formality = row.get("expected_formality")
    return {
        "filename": row["filename"],
        "expected_category": row.get("expected_category") or None,
        "expected_color": row.get("expected_color") or None,
        "expected_style": row.get("expected_style") or None,
        "expected_formality": int(formality) if formality else None,
        "expected_gender": row.get("expected_gender") or None,
    }


def take(rows: list[dict], n: int, used: set[str]) -> list[dict]:
    picked: list[dict] = []
    for row in rows:
        if row["filename"] in used:
            continue
        picked.append(row)
        used.add(row["filename"])
        if len(picked) >= n:
            break
    return picked


def main() -> None:
    rows = [
        r
        for r in common.load_labels()
        if r.get("expected_class") == "valid_single" and r.get("expected_category")
    ]
    by_cat: dict[str, list[dict]] = {}
    for row in rows:
        by_cat.setdefault(row["expected_category"], []).append(row)

    used: set[str] = set()

    def cat(name: str) -> list[dict]:
        return by_cat.get(name, [])

    casual_rows = {
        name: [r for r in cat(name) if (r.get("expected_style") or "casual") in CASUAL or not r.get("expected_style")]
        for name in ("top", "bottom", "outerwear", "shoes", "accessory")
    }
    smart_rows = {
        name: [
            r
            for r in cat(name)
            if (r.get("expected_style") in SMART)
            or (r.get("expected_formality") and int(r["expected_formality"]) >= 65)
        ]
        for name in ("top", "bottom", "outerwear", "shoes", "dress", "accessory")
    }
    female_rows = {
        name: [r for r in cat(name) if r.get("expected_gender") in {"female", "unisex", None, ""}]
        for name in ("dress", "bottom", "shoes", "accessory", "outerwear", "top")
    }
    clash_red = [r for r in rows if normalize_color(r.get("expected_color")) in CLASH_A]
    clash_green = [r for r in rows if normalize_color(r.get("expected_color")) in CLASH_B]

    def fill(spec: dict[str, int], pools: dict[str, list[dict]]) -> list[dict]:
        items: list[dict] = []
        for name, n in spec.items():
            pool = pools.get(name) or cat(name)
            items.extend(take(pool, n, used))
        return items

    wardrobes = [
        {
            "case_id": "wardrobe-casual-complete",
            "name": "complete-casual",
            "description": "Casual top/bottom/shoes plus outerwear and an accessory.",
            "venues": ALL_VENUES,
            "items": [item_entry(r) for r in fill({"top": 3, "bottom": 3, "shoes": 2, "outerwear": 1, "accessory": 1}, casual_rows)],
        },
        {
            "case_id": "wardrobe-smart-formal",
            "name": "complete-smart-formal",
            "description": "Smart/formal shirts, trousers, blazer, dress shoes, and a dress.",
            "venues": ALL_VENUES,
            "items": [item_entry(r) for r in fill({"top": 2, "bottom": 2, "outerwear": 2, "shoes": 2, "dress": 1, "accessory": 1}, smart_rows)],
        },
        {
            "case_id": "wardrobe-minimal-tops",
            "name": "minimal-tops-only",
            "description": "Incomplete closet: tops only, no bottoms or shoes.",
            "venues": ALL_VENUES,
            "items": [item_entry(r) for r in fill({"top": 3}, {"top": cat("top")})],
        },
        {
            "case_id": "wardrobe-female-unisex",
            "name": "female-unisex-dress",
            "description": "Dress-led closet with shoes, outerwear, and accessories.",
            "venues": ALL_VENUES,
            "items": [item_entry(r) for r in fill({"dress": 3, "bottom": 1, "shoes": 2, "outerwear": 1, "accessory": 2, "top": 1}, female_rows)],
        },
        {
            "case_id": "wardrobe-clashing-colour",
            "name": "clashing-colour",
            "description": "Deliberate red/pink vs green/olive mix to stress cohesion.",
            "venues": ALL_VENUES,
            "items": [item_entry(r) for r in take(clash_red, 4, used) + take(clash_green, 4, used)],
        },
    ]

    # Ensure each wardrobe still has at least one item; top up from unused valids.
    unused = [r for r in rows if r["filename"] not in used]
    for wardrobe in wardrobes:
        if wardrobe["items"]:
            continue
        extra = take(unused, 4, used)
        wardrobe["items"] = [item_entry(r) for r in extra]

    out = common.WARDROBES_DIR / "tier1_wardrobes.json"
    out.write_text(json.dumps(wardrobes, indent=2), encoding="utf-8")
    print(f"Wrote {out}")
    for wardrobe in wardrobes:
        cats = {}
        for item in wardrobe["items"]:
            cats[item.get("expected_category")] = cats.get(item.get("expected_category"), 0) + 1
        print(f"  {wardrobe['case_id']}: {len(wardrobe['items'])} items {cats}")


if __name__ == "__main__":
    main()
