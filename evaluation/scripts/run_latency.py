"""Measure client wall-clock latency for the main scenarios.

Scenarios (client-side, real HTTP round trips against the isolated instance):
  1. upload                — POST one valid garment image
  2. recommend             — POST /api/recommend on a seeded fixed wardrobe
  3. upload_to_recommend   — upload one valid garment, then recommend
  4. tryon                 — POST /api/try-on (ready or poll-to-ready)

Usage:
    backend/.venv/bin/python evaluation/scripts/run_latency.py [--reps N] [--tryon-reps N]
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from time import perf_counter

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "backend"))

import common  # noqa: E402


def upload_file(client: httpx.Client, image_path: Path) -> tuple[float, int, str | None, str | None]:
    started = perf_counter()
    with image_path.open("rb") as fh:
        response = client.post(
            f"{common.BASE_URL}/api/wardrobe/items",
            files={"file": (image_path.name, fh, "image/jpeg")},
            timeout=120.0,
        )
    elapsed_ms = (perf_counter() - started) * 1000
    detail = None
    item_id = None
    try:
        body = response.json()
        if response.status_code in {200, 201}:
            item_id = body.get("id")
        else:
            detail = body.get("detail")
    except Exception:  # noqa: BLE001
        detail = response.text[:240]
    return elapsed_ms, response.status_code, detail, item_id


def recommend(client: httpx.Client, venue: str, use_reference: bool = True) -> tuple[float, int, dict]:
    started = perf_counter()
    response = client.post(
        f"{common.BASE_URL}/api/recommend",
        json={"venue": venue, "useReference": use_reference},
        timeout=120.0,
    )
    elapsed_ms = (perf_counter() - started) * 1000
    body = {}
    try:
        body = response.json()
    except Exception:  # noqa: BLE001
        pass
    return elapsed_ms, response.status_code, body


def clear_wardrobe(client: httpx.Client) -> None:
    response = client.get(f"{common.BASE_URL}/api/wardrobe/items", timeout=30.0)
    response.raise_for_status()
    for item in response.json().get("items", []):
        client.delete(f"{common.BASE_URL}/api/wardrobe/items/{item['id']}", timeout=30.0)


def seed_wardrobe(client: httpx.Client, items: list[dict], uploads_dir: Path) -> None:
    for entry in items:
        image_path = uploads_dir / entry["filename"]
        if not image_path.is_file():
            continue
        with image_path.open("rb") as fh:
            client.post(
                f"{common.BASE_URL}/api/wardrobe/items",
                files={"file": (image_path.name, fh, "image/jpeg")},
                timeout=120.0,
            )


def seed_profile(client: httpx.Client, body_photo: Path) -> bool:
    with body_photo.open("rb") as fh:
        response = client.put(
            f"{common.BASE_URL}/api/profile",
            files={"file": (body_photo.name, fh, "image/jpeg")},
            data={"gender": "preferNot"},
            timeout=120.0,
        )
    return response.status_code == 200


def try_on_latency(client: httpx.Client, outfit_id: str) -> tuple[float, int, str, str | None]:
    started = perf_counter()
    response = client.post(f"{common.BASE_URL}/api/try-on", json={"outfitId": outfit_id}, timeout=150.0)
    elapsed_ms = (perf_counter() - started) * 1000
    status = ""
    mode = None
    body = {}
    try:
        body = response.json()
    except Exception:  # noqa: BLE001
        pass
    if response.status_code == 200:
        status = body.get("status")
        mode = body.get("mode")
        if status == "processing":
            deadline = time.time() + 120.0
            while time.time() < deadline:
                time.sleep(2.0)
                try:
                    history = client.get(f"{common.BASE_URL}/api/try-ons", timeout=30.0).json()
                    for row in history.get("results", []):
                        if row.get("outfitId") == outfit_id and row.get("status") == "ready":
                            status = "ready"
                            break
                except Exception:  # noqa: BLE001
                    pass
                if status == "ready":
                    break
            elapsed_ms = (perf_counter() - started) * 1000
    return elapsed_ms, response.status_code, status or "", mode


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reps", type=int, default=30)
    parser.add_argument("--tryon-reps", type=int, default=5)
    parser.add_argument("--venue", default="lecture")
    parser.add_argument("--data-root", default=str(common.DATA_DIR))
    parser.add_argument("--throttle", type=float, default=1.0, help="seconds to sleep between uploads (avoid API rate limits)")
    args = parser.parse_args()

    data_root = Path(args.data_root)
    uploads_dir = data_root / "uploads"
    labels = common.load_labels(data_root / "labels" / "upload_labels.csv")
    valid = [row for row in labels if row["expected_class"] == "valid_single" and row["filename"]]
    if not valid:
        print("No valid upload images found in labels. Generate a smoke set first.")
        sys.exit(1)
    upload_image = uploads_dir / valid[0]["filename"]

    manifests = common.load_wardrobe_manifests(data_root / "wardrobes")
    wardrobe_items = manifests[0]["items"] if manifests else []
    body_photos = sorted((data_root / "body_photos").glob("*.jpg"))

    results: list[dict] = []
    with httpx.Client() as client:
        def reset_wardrobe() -> None:
            """Seed a fixed base wardrobe so recommend runs on the same closet size."""
            clear_wardrobe(client)
            seed_wardrobe(client, wardrobe_items, uploads_dir)

        # recommend + upload_to_recommend need a fixed seeded wardrobe.
        reset_wardrobe()

        for rep in range(args.reps):
            up_ms, up_status, up_detail, _ = upload_file(client, upload_image)
            results.append(
                {
                    "scenario": "upload",
                    "rep": rep,
                    "elapsed_ms": round(up_ms, 1),
                    "http_status": up_status,
                    "detail": up_detail,
                    "cold": rep == 0,
                    "recorded_at": common.now_iso(),
                }
            )
            if args.throttle > 0 and rep < args.reps - 1:
                time.sleep(args.throttle)

        # Reset so recommend measures a fixed closet, not the 30 uploads above.
        reset_wardrobe()
        for rep in range(args.reps):
            rec_ms, rec_status, body = recommend(client, args.venue, use_reference=True)
            results.append(
                {
                    "scenario": "recommend",
                    "rep": rep,
                    "elapsed_ms": round(rec_ms, 1),
                    "http_status": rec_status,
                    "detail": (body or {}).get("detail"),
                    "match_status": (body or {}).get("matchStatus"),
                    "cold": rep == 0,
                    "recorded_at": common.now_iso(),
                }
            )

        reset_wardrobe()
        for rep in range(args.reps):
            up_ms, up_status, up_detail, item_id = upload_file(client, upload_image)
            rec_ms, rec_status, body = recommend(client, args.venue, use_reference=True)
            # Delete the just-uploaded item so the closet stays the same size
            # across reps (upload-to-recommend should not measure a growing closet).
            if item_id:
                try:
                    client.delete(f"{common.BASE_URL}/api/wardrobe/items/{item_id}", timeout=30.0)
                except Exception:  # noqa: BLE001
                    pass
            results.append(
                {
                    "scenario": "upload_to_recommend",
                    "rep": rep,
                    "upload_ms": round(up_ms, 1),
                    "recommend_ms": round(rec_ms, 1),
                    "elapsed_ms": round(up_ms + rec_ms, 1),
                    "http_status": rec_status if up_status in {200, 201} else up_status,
                    "detail": up_detail or (body or {}).get("detail"),
                    "cold": rep == 0,
                    "recorded_at": common.now_iso(),
                }
            )
            if args.throttle > 0 and rep < args.reps - 1:
                time.sleep(args.throttle)

        # Try-on: needs a profile body photo; record as skipped when absent.
        if body_photos:
            if seed_profile(client, body_photos[0]):
                rec_ms, rec_status, body = recommend(client, args.venue, use_reference=True)
                outfits = (body or {}).get("outfits", [])
                outfit_id = outfits[0]["id"] if outfits else None
                for rep in range(args.tryon_reps):
                    if not outfit_id:
                        results.append(
                            {
                                "scenario": "tryon",
                                "rep": rep,
                                "elapsed_ms": 0.0,
                                "http_status": 400,
                                "detail": "no outfit generated for try-on",
                                "mode": None,
                                "cold": rep == 0,
                                "recorded_at": common.now_iso(),
                            }
                        )
                        continue
                    ms, status, status_text, mode = try_on_latency(client, outfit_id)
                    results.append(
                        {
                            "scenario": "tryon",
                            "rep": rep,
                            "elapsed_ms": round(ms, 1),
                            "http_status": status,
                            "detail": None,
                            "status": status_text,
                            "mode": mode,
                            "cold": rep == 0,
                            "recorded_at": common.now_iso(),
                        }
                    )
            else:
                for rep in range(args.tryon_reps):
                    results.append(
                        {
                            "scenario": "tryon",
                            "rep": rep,
                            "elapsed_ms": 0.0,
                            "http_status": 0,
                            "detail": "profile seed failed (body photo rejected)",
                            "mode": None,
                            "cold": rep == 0,
                            "recorded_at": common.now_iso(),
                        }
                    )
        else:
            for rep in range(args.tryon_reps):
                results.append(
                    {
                        "scenario": "tryon",
                        "rep": rep,
                        "elapsed_ms": 0.0,
                        "http_status": 0,
                        "detail": "skipped: no body photo in data/body_photos/",
                        "mode": None,
                        "cold": rep == 0,
                        "recorded_at": common.now_iso(),
                    }
                )

    manifest = common.base_manifest()
    manifest["reps"] = args.reps
    manifest["tryon_reps"] = args.tryon_reps
    manifest["venue"] = args.venue
    manifest["data_root"] = str(data_root)
    manifest["throttle_s"] = args.throttle
    common.write_jsonl(common.RESULTS_RAW / "latency_results.jsonl", results)
    common.write_jsonl(common.RESULTS_RAW / "latency_manifest.jsonl", [manifest])
    print(f"Wrote {len(results)} latency records to {common.RESULTS_RAW / 'latency_results.jsonl'}")


if __name__ == "__main__":
    main()
