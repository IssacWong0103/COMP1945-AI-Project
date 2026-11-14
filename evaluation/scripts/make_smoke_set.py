"""Generate a tiny synthetic smoke set so the pipeline can be tested end-to-end
without real garment photos.

These images are NOT clothing and are NOT a real accuracy dataset. The real
VLM will typically reject them, which is fine — the point is to exercise every
script and verify the aggregation/report path runs. Replace `data/uploads/`
and `data/labels/upload_labels.csv` with real labeled images before producing
any report numbers.

Smoke artifacts are written under evaluation/runtime/smoke/ (gitignored) so the
committed `data/` directory is never polluted. Run the scripts with
`--data-root evaluation/runtime/smoke` to use this set.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

SMOKE_ROOT = common.RUNTIME_DIR / "smoke"
VALID_CASES = [
    ("u-001", "valid/top_blue.jpg", "top", "blue", "casual", 35, "unisex"),
    ("u-002", "valid/bottom_navy.jpg", "bottom", "navy", "casual", 40, "unisex"),
    ("u-003", "valid/dress_red.jpg", "dress", "red", "smartCasual", 60, "female"),
    ("u-004", "valid/shoes_white.jpg", "shoes", "white", "sporty", 30, "unisex"),
    ("u-005", "valid/accessory_black.jpg", "accessory", "black", "minimal", 50, "unisex"),
    ("u-006", "valid/outerwear_gray.jpg", "outerwear", "gray", "casual", 45, "unisex"),
]

NEGATIVE_CASES = [
    ("u-101", "negative/collage.jpg", "collage"),
    ("u-102", "negative/multi_item.jpg", "multi_item"),
    ("u-103", "negative/irrelevant.jpg", "irrelevant"),
    ("u-104", "negative/unreadable.jpg", "unreadable"),
]

COLORS = {
    "blue": (40, 90, 190),
    "navy": (20, 30, 80),
    "red": (190, 40, 40),
    "white": (235, 235, 235),
    "black": (30, 30, 30),
    "gray": (140, 140, 140),
}


def _solid(path: Path, color: tuple[int, int, int], label: str) -> None:
    img = Image.new("RGB", (320, 400), color)
    draw = ImageDraw.Draw(img)
    draw.rectangle((20, 20, 300, 380), outline=(255, 255, 255), width=4)
    draw.text((40, 180), label, fill=(255, 255, 255))
    img.save(path, format="JPEG", quality=90)


def _two_blocks(path: Path, label: str) -> None:
    img = Image.new("RGB", (320, 400), (200, 200, 200))
    draw = ImageDraw.Draw(img)
    draw.rectangle((40, 60, 150, 340), fill=(40, 90, 190))
    draw.rectangle((170, 60, 280, 340), fill=(190, 40, 40))
    draw.text((100, 180), label, fill=(255, 255, 255))
    img.save(path, format="JPEG", quality=90)


def _text_only(path: Path, label: str) -> None:
    img = Image.new("RGB", (320, 400), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((60, 180), label, fill=(0, 0, 0))
    img.save(path, format="JPEG", quality=90)


def main() -> None:
    valid_dir = SMOKE_ROOT / "uploads" / "valid"
    negative_dir = SMOKE_ROOT / "uploads" / "negative"
    labels_dir = SMOKE_ROOT / "labels"
    wardrobes_dir = SMOKE_ROOT / "wardrobes"
    valid_dir.mkdir(parents=True, exist_ok=True)
    negative_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)
    wardrobes_dir.mkdir(parents=True, exist_ok=True)

    for case_id, rel, cat, color, style, formality, gender in VALID_CASES:
        _solid(SMOKE_ROOT / "uploads" / rel, COLORS[color], f"{case_id} {cat} {color}")

    _two_blocks(SMOKE_ROOT / "uploads" / "negative/collage.jpg", "collage")
    _two_blocks(SMOKE_ROOT / "uploads" / "negative/multi_item.jpg", "multi")
    _text_only(SMOKE_ROOT / "uploads" / "negative/irrelevant.jpg", "OBJECT")
    _text_only(SMOKE_ROOT / "uploads" / "negative/unreadable.jpg", "??? blur")

    header = (
        "case_id,filename,expected_class,expected_category,expected_color,"
        "expected_style,expected_formality,expected_gender,notes\n"
    )
    lines = [header]
    for case_id, rel, cat, color, style, formality, gender in VALID_CASES:
        lines.append(
            f"{case_id},{rel},valid_single,{cat},{color},{style},{formality},{gender},synthetic smoke\n"
        )
    for case_id, rel, expected_class in NEGATIVE_CASES:
        lines.append(f"{case_id},{rel},{expected_class},,,,,,synthetic smoke\n")
    labels_path = labels_dir / "upload_labels.csv"
    labels_path.write_text("".join(lines), encoding="utf-8")

    manifest = [
        {
            "case_id": "wardrobe-smoke-01",
            "name": "smoke-casual",
            "description": "Synthetic smoke wardrobe.",
            "venues": ["lecture", "casualDate"],
            "items": [
                {"filename": "valid/top_blue.jpg", "expected_category": "top", "expected_color": "blue", "expected_style": "casual", "expected_formality": 35, "expected_gender": "unisex"},
                {"filename": "valid/bottom_navy.jpg", "expected_category": "bottom", "expected_color": "navy", "expected_style": "casual", "expected_formality": 40, "expected_gender": "unisex"},
                {"filename": "valid/shoes_white.jpg", "expected_category": "shoes", "expected_color": "white", "expected_style": "sporty", "expected_formality": 30, "expected_gender": "unisex"},
                {"filename": "valid/outerwear_gray.jpg", "expected_category": "outerwear", "expected_color": "gray", "expected_style": "casual", "expected_formality": 45, "expected_gender": "unisex"},
            ],
        }
    ]
    manifest_path = wardrobes_dir / "smoke_wardrobe.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Wrote smoke set to {SMOKE_ROOT}")
    print("Run the pipeline with: --data-root evaluation/runtime/smoke")


if __name__ == "__main__":
    main()
