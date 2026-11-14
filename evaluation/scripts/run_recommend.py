"""Evaluate recommendation quality with controlled comparisons.

For each fixed wardrobe (JSON manifests in data/wardrobes/) and each venue, this
seeds the isolated backend with exactly that wardrobe and runs three conditions:

  1. full         — USTyle with retailer-reference retrieval/styling
  2. no_reference — USTyle without reference (use_reference=false)
  3. random       — a random but complete outfit, scored with the same
                    venue_fit/cohesion functions for a programmatic baseline

Usage:
    backend/.venv/bin/python evaluation/scripts/run_recommend.py
"""

from __future__ import annotations

import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "backend"))

import common  # noqa: E402


def clear_wardrobe(client: httpx.Client) -> None:
    response = client.get(f"{common.BASE_URL}/api/wardrobe/items", timeout=30.0)
    response.raise_for_status()
    items = response.json().get("items", [])
    for item in items:
        client.delete(f"{common.BASE_URL}/api/wardrobe/items/{item['id']}", timeout=30.0)


def seed_wardrobe(client: httpx.Client, manifest_items: list[dict], uploads_dir: Path) -> dict[str, dict]:
    """Upload each wardrobe image and return {filename: item_json}."""
    by_filename: dict[str, dict] = {}
    for entry in manifest_items:
        image_path = uploads_dir / entry["filename"]
        if not image_path.is_file():
            print(f"    ! missing image {image_path}")
            continue
        with image_path.open("rb") as fh:
            response = client.post(
                f"{common.BASE_URL}/api/wardrobe/items",
                files={"file": (image_path.name, fh, "image/jpeg")},
                timeout=120.0,
            )
        if response.status_code == 201:
            item = response.json()
            by_filename[entry["filename"]] = item
            print(f"    seeded {entry['filename']} -> {item['id']}")
        else:
            detail = ""
            try:
                detail = response.json().get("detail", "")
            except Exception:  # noqa: BLE001
                detail = response.text[:120]
            print(f"    ! upload failed {entry['filename']} ({response.status_code}) {detail}")
    return by_filename


def to_wardrobe_item(item: dict):
    from app.models import WardrobeItem

    return WardrobeItem(
        id=item["id"],
        image_url=item["imageUrl"],
        category=item["category"],
        color=item["color"],
        cut=item["cut"],
        style=item["style"],
        formality_score=item["formalityScore"],
        description=item["description"],
        item_gender=item["itemGender"],
        notes=None,
        created_at=datetime.now(timezone.utc),
    )


def build_random_outfit(items: list[dict], venue: str, seed: str) -> dict:
    """Random complete outfit with the same programmatic scores as the system."""
    from app.services.matching import cohesion_score, venue_fit_score

    rng = random.Random(seed)
    by_cat: dict[str, list[dict]] = {}
    for item in items:
        by_cat.setdefault(item["category"], []).append(item)

    picked: list[dict] = []
    if "dress" in by_cat and rng.random() < 0.5:
        picked.append(rng.choice(by_cat["dress"]))
    else:
        if "top" in by_cat:
            picked.append(rng.choice(by_cat["top"]))
        if "bottom" in by_cat:
            picked.append(rng.choice(by_cat["bottom"]))
    for cat in ("outerwear", "shoes", "accessory"):
        if cat in by_cat and rng.random() < 0.6:
            picked.append(rng.choice(by_cat[cat]))

    model_items = [to_wardrobe_item(item) for item in picked]
    categories = [item["category"] for item in picked]
    complete = ("top" in categories and "bottom" in categories) or ("dress" in categories)
    v_fit = venue_fit_score(model_items, venue, None)
    coh = cohesion_score(model_items, None)
    outfit = {
        "id": f"random-{seed}",
        "venue_fit_score": round(v_fit, 4),
        "cohesion_score": round(coh, 4),
        "overall_score": round(0.55 * v_fit + 0.45 * coh, 4),
        "formality_score": round(
            sum(item["formalityScore"] for item in picked) / len(picked), 1
        ) if picked else 0.0,
        "model_reference_url": None,
        "inspiration": None,
        "item_ids": [item["id"] for item in picked],
        "categories": categories,
    }
    return {
        "outfit": outfit,
        "constraint_checks": {
            "complete": complete,
            "duplicate_items": len(set(categories)) != len(categories),
            "invalid_combination": False,
            "empty_return": False,
        },
    }


def constraint_checks(outfit: dict) -> dict:
    categories = outfit.get("categories") or []
    item_ids = outfit.get("item_ids") or []
    return {
        "complete": ("top" in categories and "bottom" in categories) or ("dress" in categories),
        "duplicate_items": len(set(item_ids)) != len(item_ids),
        "invalid_combination": len(set(categories)) != len(categories),
        "empty_return": False,
    }


def recommend_once(client: httpx.Client, venue: str, use_reference: bool) -> dict:
    started = perf_counter()
    payload = {"venue": venue, "useReference": use_reference}
    response = client.post(f"{common.BASE_URL}/api/recommend", json=payload, timeout=120.0)
    elapsed_ms = (perf_counter() - started) * 1000
    body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    if response.status_code != 200:
        return {
            "outcome": "error",
            "match_status": None,
            "warning": None,
            "elapsed_ms": round(elapsed_ms, 1),
            "outfits": [],
            "http_status": response.status_code,
            "error_detail": (body or {}).get("detail") or response.text[:240],
        }
    outfits = []
    for outfit in body.get("outfits", []):
        outfits.append(
            {
                "id": outfit.get("id"),
                "venue_fit_score": outfit.get("venueFitScore"),
                "cohesion_score": outfit.get("cohesionScore"),
                "overall_score": outfit.get("overallScore"),
                "formality_score": outfit.get("formalityScore"),
                "model_reference_url": outfit.get("modelReferenceUrl"),
                "inspiration": outfit.get("inspiration"),
                "item_ids": [item.get("id") for item in outfit.get("items", [])],
                "categories": [item.get("category") for item in outfit.get("items", [])],
            }
        )
    return {
        "outcome": "ok" if outfits else "empty",
        "match_status": body.get("matchStatus"),
        "warning": body.get("warning"),
        "elapsed_ms": round(elapsed_ms, 1),
        "outfits": outfits,
        "http_status": 200,
        "error_detail": None,
    }


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", default=str(common.DATA_DIR))
    parser.add_argument("--wardrobes", default=None)
    args = parser.parse_args()

    data_root = Path(args.data_root)
    uploads_dir = data_root / "uploads"
    wardrobes_path = Path(args.wardrobes) if args.wardrobes else data_root / "wardrobes"

    manifests = common.load_wardrobe_manifests(wardrobes_path)
    if not manifests:
        print("No wardrobe manifests found. Generate a smoke set or add manifests first.")
        sys.exit(1)

    results: list[dict] = []
    with httpx.Client() as client:
        for manifest in manifests:
            case_id = manifest["case_id"]
            venues = manifest.get("venues") or ["lecture"]
            print(f"== {case_id}: {manifest.get('name', '')} ==")
            clear_wardrobe(client)
            seeded = seed_wardrobe(client, manifest.get("items", []), uploads_dir)
            items = list(seeded.values())
            if not items:
                print(f"  ! no items seeded for {case_id}, skipping")
                continue

            for venue in venues:
                for condition in ("full", "no_reference", "random"):
                    seed = f"{case_id}:{venue}:{condition}"
                    if condition == "random":
                        rnd = build_random_outfit(items, venue, seed)
                        record = {
                            "case_id": case_id,
                            "venue": venue,
                            "condition": condition,
                            "seed": seed,
                            "outcome": "ok" if rnd["outfit"]["item_ids"] else "empty",
                            "match_status": "matched",
                            "warning": None,
                            "elapsed_ms": 0.0,
                            "outfits": [rnd["outfit"]],
                            "recorded_at": common.now_iso(),
                            "constraint_checks": rnd["constraint_checks"],
                        }
                    else:
                        result = recommend_once(client, venue, use_reference=(condition == "full"))
                        record = {
                            "case_id": case_id,
                            "venue": venue,
                            "condition": condition,
                            "seed": seed,
                            "outcome": result["outcome"],
                            "match_status": result["match_status"],
                            "warning": result["warning"],
                            "elapsed_ms": result["elapsed_ms"],
                            "outfits": result["outfits"],
                            "recorded_at": common.now_iso(),
                            "constraint_checks": (
                                constraint_checks(result["outfits"][0])
                                if result["outfits"]
                                else {"complete": False, "duplicate_items": False, "invalid_combination": False, "empty_return": True}
                            ),
                            "http_status": result.get("http_status"),
                            "error_detail": result.get("error_detail"),
                        }
                    results.append(record)
                    print(
                        f"  {venue:12s} {condition:12s} -> {record['outcome']} "
                        f"({record['elapsed_ms']:.0f}ms)"
                    )

    manifest = common.base_manifest()
    common.write_jsonl(common.RESULTS_RAW / "recommend_results.jsonl", results)
    common.write_jsonl(common.RESULTS_RAW / "recommend_manifest.jsonl", [manifest])
    print(f"\nWrote {len(results)} recommendation results to {common.RESULTS_RAW / 'recommend_results.jsonl'}")


if __name__ == "__main__":
    main()
