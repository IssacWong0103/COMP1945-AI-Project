"""Functional reliability matrix — pass/fail scenarios against the isolated backend.

Each case records input, expected behavior, actual behavior, and pass/fail.
Some cases depend on environment (e.g. screening-unavailable when no DeepSeek
key), and are marked skipped when not applicable.

Usage:
    backend/.venv/bin/python evaluation/scripts/run_functional.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import common  # noqa: E402


def _upload(client: httpx.Client, rel: str, uploads_dir: Path) -> httpx.Response:
    image_path = uploads_dir / rel
    if not image_path.is_file():
        raise FileNotFoundError(rel)
    with image_path.open("rb") as fh:
        return client.post(
            f"{common.BASE_URL}/api/wardrobe/items",
            files={"file": (image_path.name, fh, common.image_mime(image_path))},
            timeout=120.0,
        )


def _upload_retry(client: httpx.Client, rel: str, uploads_dir: Path, attempts: int = 3) -> httpx.Response:
    """Retry transient 503 (VLM screening unavailable) so a temporary upstream
    rate limit doesn't fail a functional scenario."""
    import time as _time

    last: httpx.Response | None = None
    for attempt in range(attempts):
        last = _upload(client, rel, uploads_dir)
        if last.status_code != 503 or attempt == attempts - 1:
            return last
        _time.sleep(2.0 * (attempt + 1))
    return last


def _clear(client: httpx.Client) -> None:
    response = client.get(f"{common.BASE_URL}/api/wardrobe/items", timeout=30.0)
    response.raise_for_status()
    for item in response.json().get("items", []):
        client.delete(f"{common.BASE_URL}/api/wardrobe/items/{item['id']}", timeout=30.0)


def _recommend(client: httpx.Client, venue: str = "lecture") -> httpx.Response:
    return client.post(
        f"{common.BASE_URL}/api/recommend",
        json={"venue": venue},
        timeout=120.0,
    )


def _seed(client: httpx.Client, rels: list[str], uploads_dir: Path) -> list[str]:
    seeded: list[str] = []
    for rel in rels:
        try:
            response = _upload_retry(client, rel, uploads_dir)
        except FileNotFoundError:
            continue
        if response.status_code == 201:
            seeded.append(rel)
    return seeded


def _seed_complete(client: httpx.Client, by_category: dict[str, list[str]], uploads_dir: Path) -> list[str]:
    """Upload one accepted item per required category, trying fallbacks."""
    seeded: list[str] = []
    for cat in ("top", "bottom", "shoes"):
        for rel in by_category.get(cat, []):
            try:
                response = _upload_retry(client, rel, uploads_dir)
            except FileNotFoundError:
                continue
            if response.status_code == 201:
                seeded.append(rel)
                break
    for cat in ("outerwear", "accessory"):
        for rel in by_category.get(cat, [])[:1]:
            try:
                response = _upload_retry(client, rel, uploads_dir)
            except FileNotFoundError:
                continue
            if response.status_code == 201:
                seeded.append(rel)
                break
    return seeded


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", default=str(common.DATA_DIR))
    args = parser.parse_args()

    data_root = Path(args.data_root)
    uploads_dir = data_root / "uploads"
    labels = common.load_labels(data_root / "labels" / "upload_labels.csv")

    by_class: dict[str, list[str]] = {}
    by_category: dict[str, list[str]] = {}
    for row in labels:
        by_class.setdefault(row["expected_class"], []).append(row["filename"])
        if row.get("expected_class") == "valid_single" and row.get("expected_category"):
            by_category.setdefault(row["expected_category"], []).append(row["filename"])

    # Prefer garments the held-out upload run actually accepted, so venue
    # scenarios are not poisoned by the one known false-reject shoe.
    accepted_by_cat: dict[str, list[str]] = {}
    upload_results = common.load_jsonl(common.RESULTS_RAW / "upload_results.jsonl")
    for record in upload_results:
        if record.get("outcome") == "accepted" and record.get("expected_category"):
            accepted_by_cat.setdefault(record["expected_category"], []).append(record["filename"])
    if accepted_by_cat:
        by_category = accepted_by_cat

    def first(cls: str) -> str | None:
        return by_class.get(cls, [None])[0]

    cases: list[dict] = []
    with httpx.Client() as client:
        def add_case(case_id, description, expected_status, actual_fn):
            try:
                response = actual_fn()
                status = response.status_code
                body_text = response.text[:200]
            except Exception as exc:  # noqa: BLE001
                status = None
                body_text = str(exc)
            cases.append(
                {
                    "case_id": case_id,
                    "description": description,
                    "expected_status": expected_status,
                    "actual_status": status,
                    "actual_detail": body_text,
                    "passed": status == expected_status,
                    "recorded_at": common.now_iso(),
                }
            )

        valid_file = (accepted_by_cat.get("top") or [None])[0] or first("valid_single")
        mixed: list[str] = []
        for cat in ("top", "bottom", "shoes", "outerwear"):
            files = by_category.get(cat) or []
            if files:
                mixed.append(files[0])
        if not mixed and valid_file:
            mixed = [valid_file]
        complete = mixed if len(mixed) >= 3 else mixed
        if valid_file:
            add_case("valid-upload", "A valid single-garment image is accepted (201).", 201, lambda: _upload_retry(client, valid_file, uploads_dir))

        for cls, case_id in (
            ("model_worn", "reject-model-outfit"),
            ("irrelevant", "reject-irrelevant"),
            ("multi_item", "reject-multi-item"),
            ("collage", "reject-collage"),
            ("unreadable", "reject-unreadable"),
        ):
            rel = first(cls)
            if rel:
                add_case(
                    case_id,
                    f"{cls.replace('_', ' ')} image is rejected (400).",
                    400,
                    lambda rel=rel: _upload_retry(client, rel, uploads_dir),
                )

        # Empty wardrobe
        add_case("empty-wardrobe", "Recommend on an empty wardrobe returns 200 with a warning.", 200, lambda: (_clear(client), _recommend(client))[1])

        # Incomplete wardrobe (only a top)
        if valid_file:
            add_case(
                "incomplete-wardrobe",
                "Recommend with only a top returns 200 (best available) with a warning.",
                200,
                lambda: (_clear(client), _seed(client, [valid_file], uploads_dir), _recommend(client))[2],
            )

        # Recommendation retry (same request twice, both 200)
        if complete:
            def retry_twice():
                _clear(client)
                _seed_complete(client, by_category, uploads_dir)
                first_resp = _recommend(client)
                second_resp = _recommend(client)
                if first_resp.status_code == 200 and second_resp.status_code == 200:
                    return first_resp
                return first_resp if first_resp.status_code != 200 else second_resp

            add_case("recommend-retry", "Recommendation retry succeeds twice (200).", 200, retry_twice)

        # Save/restore: recommend then list saved looks
        if complete:
            def save_restore():
                _clear(client)
                _seed_complete(client, by_category, uploads_dir)
                _recommend(client)
                return client.get(f"{common.BASE_URL}/api/outfits", timeout=30.0)

            add_case("save-restore", "Saved looks are retrievable after recommendation (200).", 200, save_restore)

        # Try-on without a profile body photo (needs a saved outfit first).
        def tryon_without_body_photo():
            _clear(client)
            _seed_complete(client, by_category, uploads_dir)
            rec = _recommend(client)
            if rec.status_code != 200:
                return rec
            outfits = rec.json().get("outfits", [])
            if not outfits:
                raise LookupError("no saved outfit available to attempt try-on")
            return client.post(
                f"{common.BASE_URL}/api/try-on",
                json={"outfitId": outfits[0]["id"]},
                timeout=30.0,
            )

        try:
            response = tryon_without_body_photo()
            status = response.status_code
            detail = response.text[:200]
            cases.append(
                {
                    "case_id": "tryon-no-body-photo",
                    "description": "Try-on without a profile body photo returns 400.",
                    "expected_status": 400,
                    "actual_status": status,
                    "actual_detail": detail,
                    "passed": status == 400,
                    "recorded_at": common.now_iso(),
                }
            )
        except LookupError:
            cases.append(
                {
                    "case_id": "tryon-no-body-photo",
                    "description": "Try-on without a profile body photo returns 400 — skipped: no saved outfit available.",
                    "expected_status": 400,
                    "actual_status": None,
                    "actual_detail": "skipped: no saved outfit available",
                    "passed": None,
                    "recorded_at": common.now_iso(),
                }
            )

        # Screening unavailable: upload when DeepSeek is not configured.
        health = client.get(f"{common.BASE_URL}/api/health", timeout=30.0).json()
        deepseek_configured = bool(health.get("deepseekConfigured"))
        if deepseek_configured:
            cases.append(
                {
                    "case_id": "screening-unavailable",
                    "description": "Upload when screening is unavailable (503) — skipped: DeepSeek is configured.",
                    "expected_status": 503,
                    "actual_status": None,
                    "actual_detail": "skipped: DeepSeek configured",
                    "passed": None,
                    "recorded_at": common.now_iso(),
                }
            )
        elif valid_file:
            add_case(
                "screening-unavailable",
                "Upload when DeepSeek is not configured returns 503.",
                503,
                lambda: _upload_retry(client, valid_file, uploads_dir),
            )

        # Duplicate upload of the same valid image.
        if valid_file:
            def duplicate_upload():
                _clear(client)
                first_resp = _upload_retry(client, valid_file, uploads_dir)
                second_resp = _upload_retry(client, valid_file, uploads_dir)
                if first_resp.status_code == 201 and second_resp.status_code == 201:
                    return second_resp
                return second_resp if second_resp.status_code != 201 else first_resp

            add_case("duplicate-upload", "Re-uploading the same valid garment is accepted again (201).", 201, duplicate_upload)

        # Every venue should return 200 on a mixed closet.
        if mixed:
            for venue in ("lecture", "careerFair", "casualDate", "hallGathering", "formal"):
                add_case(
                    f"recommend-{venue}",
                    f"Recommend for {venue} on a mixed closet returns 200.",
                    200,
                    lambda venue=venue: (_clear(client), _seed_complete(client, by_category, uploads_dir), _recommend(client, venue))[2],
                )

        # Formal venue with only casual-looking items should still 200 (graceful fallback).
        casual_only = (by_category.get("top") or [valid_file])[:2] if valid_file else []
        if casual_only:
            add_case(
                "formal-insufficient-fallback",
                "Recommend for formal with an incomplete/casual closet returns 200 (best available).",
                200,
                lambda: (_clear(client), _seed(client, casual_only, uploads_dir), _recommend(client, "formal"))[2],
            )

        # Offline behavior: connection to a closed port fails cleanly.
        try:
            offline = httpx.Client(timeout=3.0).post("http://127.0.0.1:9/api/health")
            offline_status = offline.status_code
        except Exception as exc:  # noqa: BLE001
            offline_status = None
        cases.append(
            {
                "case_id": "offline-api",
                "description": "A request to an unavailable server fails cleanly (connection error).",
                "expected_status": None,
                "actual_status": offline_status,
                "actual_detail": "connection error" if offline_status is None else "unexpected response",
                "passed": offline_status is None,
                "recorded_at": common.now_iso(),
            }
        )

    manifest = common.base_manifest()
    manifest["deepseek_configured"] = deepseek_configured
    manifest["data_root"] = str(data_root)
    common.write_jsonl(common.RESULTS_RAW / "functional_results.jsonl", cases)
    common.write_jsonl(common.RESULTS_RAW / "functional_manifest.jsonl", [manifest])

    passed = sum(1 for c in cases if c["passed"] is True)
    failed = sum(1 for c in cases if c["passed"] is False)
    skipped = sum(1 for c in cases if c["passed"] is None)
    print(f"Functional matrix: {passed} passed, {failed} failed, {skipped} skipped")
    for case in cases:
        mark = "PASS" if case["passed"] is True else ("FAIL" if case["passed"] is False else "SKIP")
        print(f"  [{mark}] {case['case_id']}: {case['description']}")
    print(f"\nWrote {len(cases)} cases to {common.RESULTS_RAW / 'functional_results.jsonl'}")


if __name__ == "__main__":
    main()
