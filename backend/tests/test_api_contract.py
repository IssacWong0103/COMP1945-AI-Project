from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from sqlalchemy import create_engine, inspect, text

from app.db import ensure_outfit_tryon_columns
from app.models import Outfit, Profile, WardrobeItem
from app.schemas import OutfitItemRef, OutfitOut
from app.services.tryon import TryOnFailed, TryOnPending, generate_tryon


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _items(*, image_url: str = "/uploads/wardrobe/top.jpg") -> str:
    return json.dumps(
        {
            "items": [
                {
                    "id": "top-1",
                    "category": "top",
                    "color": "navy",
                    "description": "Oxford shirt",
                    "imageUrl": image_url,
                },
                {
                    "id": "bottom-1",
                    "category": "bottom",
                    "color": "khaki",
                    "description": "Chinos",
                    "imageUrl": "/uploads/wardrobe/bottom.jpg" if image_url else "",
                },
            ]
        }
    )


def _seed_outfit(session_factory, **fields) -> None:
    db = session_factory()
    db.add(Profile(id=1, body_photo_url=fields.pop("body_photo_url", "/uploads/profile/body.jpg")))
    db.add(
        Outfit(
            id=fields.pop("id", "outfit-1"),
            venue="lecture",
            items_json=fields.pop("items_json", _items()),
            venue_fit_score=0.8,
            cohesion_score=0.7,
            overall_score=0.75,
            rationale="Test look",
            created_at=_now(),
            **fields,
        )
    )
    db.commit()
    db.close()


def _seed_wardrobe(session_factory) -> None:
    db = session_factory()
    now = _now()
    db.add(
        WardrobeItem(
            id="top-1",
            image_url="/uploads/wardrobe/top.jpg",
            category="top",
            color="navy",
            cut="regular",
            style="smartCasual",
            description="Oxford shirt",
            item_gender="unisex",
            created_at=now,
        )
    )
    db.add(
        WardrobeItem(
            id="bottom-1",
            image_url="/uploads/wardrobe/bottom.jpg",
            category="bottom",
            color="khaki",
            cut="straight",
            style="smartCasual",
            description="Chinos",
            item_gender="unisex",
            created_at=now,
        )
    )
    db.commit()
    db.close()


def test_outfit_omits_style_reference_until_set() -> None:
    item = OutfitItemRef(
        id="top-1",
        category="top",
        color="navy",
        description="Oxford shirt",
        image_url="/uploads/wardrobe/top.jpg",
    )
    outfit = OutfitOut(
        id="look-1",
        items=[item],
        venue_fit_score=0.5,
        cohesion_score=0.5,
        overall_score=0.5,
        rationale="Neat enough for lecture.",
        try_on_url=None,
    )
    dumped = outfit.model_dump(by_alias=True)
    assert "styleReference" not in dumped
    assert dumped["tryOnUrl"] is None

    named = outfit.model_copy(update={"style_reference": "campus-smart-12"})
    assert named.model_dump(by_alias=True)["styleReference"] == "campus-smart-12"


def test_recommend_uses_simple_fallback_without_style_reference(client, session_factory) -> None:
    _seed_wardrobe(session_factory)
    response = client.post("/api/recommend", json={"venue": "lecture"})
    assert response.status_code == 200
    body = response.json()
    assert body["searchMode"] == "simpleFallback"
    assert body["outfits"]
    for outfit in body["outfits"]:
        assert "styleReference" not in outfit
        assert "style_reference" not in outfit
        assert outfit["tryOnUrl"] is None
    stored = client.post("/api/try-on", json={"outfitId": body["outfits"][0]["id"]})
    assert stored.status_code == 400
    assert "photo" in stored.json()["detail"].lower()


def test_missing_key_is_failed_not_a_ready_collage(client, session_factory, monkeypatch) -> None:
    called = {"kie": 0}

    async def explode(*_args, **_kwargs):
        called["kie"] += 1
        raise AssertionError("provider should not be called")

    monkeypatch.setattr("app.services.tryon._create_kie_task", explode)
    stored = json.loads(_items())
    stored["styleReferenceUrl"] = "https://cdn.example.com/style.jpg"
    _seed_outfit(session_factory, items_json=json.dumps(stored))

    response = client.post("/api/try-on", json={"outfitId": "outfit-1"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["tryOnUrl"] is None
    assert body["resultKind"] is None
    assert body["fallbackReason"] == "missing_key"
    assert body["styleReferenceUrl"] == "https://cdn.example.com/style.jpg"
    assert "local preview" in body["detail"].lower()
    assert called["kie"] == 0


def test_accept_preview_returns_collage_when_key_missing(client, session_factory, monkeypatch) -> None:
    def fake_collage(_body, _garments, stem):
        return f"/uploads/tryon/{stem}.jpg"

    monkeypatch.setattr("app.services.tryon.save_fallback_collage", fake_collage)
    _seed_outfit(session_factory)

    response = client.post("/api/try-on", json={"outfitId": "outfit-1", "acceptPreview": True})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["resultKind"] == "collage"
    assert body["tryOnUrl"] == "/uploads/tryon/outfit-1.jpg"
    assert body["fallbackReason"] == "missing_key"
    assert "local preview" in body["detail"].lower()


def test_cached_collage_is_not_served_as_success_without_preview(client, session_factory, monkeypatch) -> None:
    calls = {"n": 0}

    def fake_collage(_body, _garments, stem):
        calls["n"] += 1
        return f"/uploads/tryon/{stem}.jpg"

    monkeypatch.setattr("app.services.tryon.save_fallback_collage", fake_collage)
    _seed_outfit(session_factory)

    preview = client.post("/api/try-on", json={"outfitId": "outfit-1", "acceptPreview": True})
    assert preview.json()["resultKind"] == "collage"

    again = client.post("/api/try-on", json={"outfitId": "outfit-1"})
    assert again.status_code == 200
    body = again.json()
    assert body["status"] == "failed"
    assert body["tryOnUrl"] is None
    assert body["fallbackReason"] == "missing_key"

    cached = client.post("/api/try-on", json={"outfitId": "outfit-1", "acceptPreview": True})
    assert cached.json()["resultKind"] == "collage"
    assert cached.json()["tryOnUrl"] == "/uploads/tryon/outfit-1.jpg"
    assert calls["n"] == 1


def test_local_images_are_not_a_ready_tryon(client, session_factory, monkeypatch) -> None:
    monkeypatch.setattr("app.config.settings.kie_api_key", "test-key")
    called = {"kie": 0}

    async def explode(*_args, **_kwargs):
        called["kie"] += 1
        raise AssertionError("provider should not be called")

    monkeypatch.setattr("app.services.tryon._create_kie_task", explode)
    _seed_outfit(session_factory)

    response = client.post("/api/try-on", json={"outfitId": "outfit-1"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["tryOnUrl"] is None
    assert body["fallbackReason"] == "local_images_not_public"
    assert called["kie"] == 0


def test_missing_inputs_after_a_well_formed_request(client, session_factory, monkeypatch) -> None:
    monkeypatch.setattr("app.config.settings.kie_api_key", "test-key")
    monkeypatch.setattr("app.config.settings.public_base_url", "https://photos.example.com")
    _seed_outfit(session_factory, items_json=_items(image_url=""))

    response = client.post("/api/try-on", json={"outfitId": "outfit-1"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["fallbackReason"] == "missing_inputs"
    assert body["tryOnUrl"] is None


def test_provider_error_is_http_200(client, session_factory, monkeypatch) -> None:
    monkeypatch.setattr("app.config.settings.kie_api_key", "test-key")
    monkeypatch.setattr("app.config.settings.public_base_url", "https://photos.example.com")

    async def fail(*_args, **_kwargs):
        raise TryOnFailed("provider exploded")

    monkeypatch.setattr("app.services.tryon._create_kie_task", fail)
    _seed_outfit(session_factory)

    response = client.post("/api/try-on", json={"outfitId": "outfit-1"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["fallbackReason"] == "provider_error"
    assert body["tryOnUrl"] is None
    assert "provider exploded" not in json.dumps(body)
    assert "local preview" in body["detail"].lower()


def test_timeout_can_resume_and_generated_cache_keeps_kind(client, session_factory, monkeypatch) -> None:
    monkeypatch.setattr("app.config.settings.kie_api_key", "test-key")
    monkeypatch.setattr("app.config.settings.public_base_url", "https://photos.example.com")
    created: list[str] = []
    polls: list[str] = []
    state = {"phase": "timeout"}

    async def create(_prompt, urls):
        assert urls[0].startswith("https://photos.example.com/")
        created.append("new")
        return "task-9"

    async def poll(task_id):
        polls.append(task_id)
        if state["phase"] == "timeout":
            raise TryOnPending(task_id)
        return "https://cdn.example.com/out.jpg"

    async def download(_url, stem):
        return f"/uploads/tryon/{stem}.jpg"

    monkeypatch.setattr("app.services.tryon._create_kie_task", create)
    monkeypatch.setattr("app.services.tryon._poll_kie_task", poll)
    monkeypatch.setattr("app.services.tryon._download_result", download)
    _seed_outfit(session_factory)

    timed_out = client.post("/api/try-on", json={"outfitId": "outfit-1"})
    assert timed_out.status_code == 200
    assert timed_out.json()["status"] == "failed"
    assert timed_out.json()["fallbackReason"] == "timeout"
    assert created == ["new"]
    assert polls == ["task-9"]

    state["phase"] = "done"
    ready = client.post("/api/try-on", json={"outfitId": "outfit-1"})
    assert ready.status_code == 200
    body = ready.json()
    assert body["status"] == "ready"
    assert body["resultKind"] == "generated"
    assert body["tryOnUrl"] == "/uploads/tryon/outfit-1.jpg"
    assert body["fallbackReason"] is None
    assert created == ["new"]
    assert polls == ["task-9", "task-9"]

    cached = client.post("/api/try-on", json={"outfitId": "outfit-1"})
    assert cached.json()["resultKind"] == "generated"
    assert cached.json()["tryOnUrl"] == "/uploads/tryon/outfit-1.jpg"
    assert polls == ["task-9", "task-9"]


def test_legacy_ready_row_without_kind_is_not_served(client, session_factory) -> None:
    _seed_outfit(
        session_factory,
        try_on_url="/uploads/tryon/legacy.jpg",
        try_on_status="ready",
        try_on_result_kind=None,
    )
    response = client.post("/api/try-on", json={"outfitId": "outfit-1"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["tryOnUrl"] is None
    assert body["fallbackReason"] == "missing_key"


def test_validation_errors_are_http_400(client, session_factory) -> None:
    missing = client.post("/api/try-on", json={"outfitId": "missing"})
    assert missing.status_code == 400

    _seed_outfit(session_factory, id="empty-look", items_json=json.dumps({"items": []}))
    empty = client.post("/api/try-on", json={"outfitId": "empty-look"})
    assert empty.status_code == 400

    db = session_factory()
    profile = db.get(Profile, 1)
    assert profile is not None
    profile.body_photo_url = None
    db.add(
        Outfit(
            id="no-photo",
            venue="lecture",
            items_json=_items(),
            venue_fit_score=0.5,
            cohesion_score=0.5,
            overall_score=0.5,
            rationale="No photo",
            created_at=_now(),
        )
    )
    db.commit()
    db.close()
    no_photo = client.post("/api/try-on", json={"outfitId": "no-photo"})
    assert no_photo.status_code == 400
    assert "photo" in no_photo.json()["detail"].lower()


def test_invalid_stored_outfit_is_server_error(client, session_factory) -> None:
    _seed_outfit(session_factory, items_json="{")
    response = client.post("/api/try-on", json={"outfitId": "outfit-1"})
    assert response.status_code == 500


def test_ensure_outfit_columns_on_older_sqlite(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE outfits (
                    id VARCHAR(36) PRIMARY KEY,
                    venue VARCHAR(32) NOT NULL,
                    items_json TEXT NOT NULL,
                    venue_fit_score FLOAT NOT NULL,
                    cohesion_score FLOAT NOT NULL,
                    overall_score FLOAT NOT NULL,
                    rationale TEXT NOT NULL,
                    try_on_url VARCHAR(1024),
                    try_on_status VARCHAR(32),
                    kie_task_id VARCHAR(128),
                    created_at DATETIME NOT NULL
                )
                """
            )
        )
    ensure_outfit_tryon_columns(engine)
    ensure_outfit_tryon_columns(engine)
    names = {column["name"] for column in inspect(engine).get_columns("outfits")}
    assert "try_on_result_kind" in names
    assert "try_on_fallback_reason" in names
    assert "try_on_detail" in names
    assert "try_on_style_reference_url" in names


def test_generate_tryon_preview_and_block_reasons(monkeypatch) -> None:
    monkeypatch.setattr("app.services.tryon.save_fallback_collage", lambda *_a, **_k: "/uploads/tryon/x.jpg")

    failed = asyncio.run(
        generate_tryon(
            outfit_id="x",
            body_photo_url="/uploads/profile/body.jpg",
            garments=[{"imageUrl": "/uploads/wardrobe/top.jpg"}],
            accept_preview=False,
        )
    )
    assert failed.status == "failed"
    assert failed.fallback_reason == "missing_key"
    assert failed.try_on_url is None
    assert failed.result_kind is None

    preview = asyncio.run(
        generate_tryon(
            outfit_id="x",
            body_photo_url="/uploads/profile/body.jpg",
            garments=[{"imageUrl": "/uploads/wardrobe/top.jpg"}],
            accept_preview=True,
        )
    )
    assert preview.status == "ready"
    assert preview.result_kind == "collage"
    assert preview.try_on_url == "/uploads/tryon/x.jpg"
