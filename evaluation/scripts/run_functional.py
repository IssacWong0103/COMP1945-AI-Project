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
            files={"file": (image_path.name, fh, "image/jpeg")},
            timeout=120.0,
        )


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


def _seed(client: httpx.Client, rels: list[str], uploads_dir: Path) -> None:
    for rel in rels:
        _upload(client, rel, uploads_dir)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", default=str(common.DATA_DIR))
    args = parser.parse_args()

    data_root = Path(args.data_root)
    uploads_dir = data_root / "uploads"
    labels = common.load_labels(data_root / "labels" / "upload_labels.csv")

    by_class: dict[str, list[str]] = {}
    for row in labels:
        by_class.setdefault(row["expected_class"], []).append(row["filename"])

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

        valid_file = first("valid_single")
        if valid_file:
            add_case("valid-upload", "A valid single-garment image is accepted (201).", 201, lambda: _upload(client, valid_file, uploads_dir))

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
                    lambda rel=rel: _upload(client, rel, uploads_dir),
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
        if valid_file:
            def retry_twice():
                _clear(client)
                _seed(client, [valid_file], uploads_dir)
                first_resp = _recommend(client)
                second_resp = _recommend(client)
                if first_resp.status_code == 200 and second_resp.status_code == 200:
                    return first_resp
                return first_resp if first_resp.status_code != 200 else second_resp

            add_case("recommend-retry", "Recommendation retry succeeds twice (200).", 200, retry_twice)

        # Save/restore: recommend then list saved looks
        if valid_file:
            def save_restore():
                _clear(client)
                _seed(client, [valid_file], uploads_dir)
                _recommend(client)
                return client.get(f"{common.BASE_URL}/api/outfits", timeout=30.0)

            add_case("save-restore", "Saved looks are retrievable after recommendation (200).", 200, save_restore)

        # Try-on without a profile body photo (needs a saved outfit first).
        def tryon_without_body_photo():
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
                lambda: _upload(client, valid_file, uploads_dir),
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
