from __future__ import annotations

import json
from datetime import datetime, timezone
from time import perf_counter

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Outfit, Profile, WardrobeItem
from app.schemas import OutfitOut, RecommendRequest, RecommendResponse, SavedLookListResponse, SavedLookOut
from app.services.matching import recommend_outfits

router = APIRouter(tags=["recommend"])


def _persist(db: Session, outfit: OutfitOut, venue: str) -> OutfitOut:
    row = Outfit(
        id=outfit.id,
        venue=venue,
        items_json=outfit.model_dump_json(by_alias=True),
        venue_fit_score=outfit.venue_fit_score,
        cohesion_score=outfit.cohesion_score,
        overall_score=outfit.overall_score,
        rationale=outfit.rationale,
        try_on_url=None,
        try_on_status=None,
        kie_task_id=None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    return outfit


@router.post("/recommend", response_model=RecommendResponse)
def recommend(payload: RecommendRequest, db: Session = Depends(get_db)) -> RecommendResponse:
    started = perf_counter()
    items = db.scalars(select(WardrobeItem).order_by(WardrobeItem.created_at.asc())).all()
    profile = db.scalars(select(Profile).limit(1)).first()
    preferred = payload.preferred_style or (profile.preferred_style if profile else None)
    feedback = (payload.feedback or "").strip() or None
    weather = (payload.weather or "").strip() or None
    time_of_day = (payload.time_of_day or "").strip() or None
    dress_code = (payload.dress_code or "").strip() or None
    notes = (payload.notes or "").strip() or None
    outfits, warning = recommend_outfits(
        items,
        payload.venue,
        preferred,
        feedback,
        weather=weather,
        time_of_day=time_of_day,
        dress_code=dress_code,
        notes=notes,
    )
    for outfit in outfits:
        _persist(db, outfit, payload.venue)
    db.commit()
    elapsed_ms = int((perf_counter() - started) * 1000)
    return RecommendResponse(outfits=outfits, elapsed_ms=elapsed_ms, warning=warning)


def _thumbnail(items_json: str) -> str | None:
    try:
        snapshot = json.loads(items_json)
    except json.JSONDecodeError:
        return None
    items = snapshot.get("items") if isinstance(snapshot, dict) else snapshot
    if not isinstance(items, list) or not items:
        return None
    first = items[0]
    if not isinstance(first, dict):
        return None
    url = first.get("imageUrl") or first.get("image_url")
    return url if isinstance(url, str) and url else None


@router.get("/outfits", response_model=SavedLookListResponse)
def list_saved_looks(db: Session = Depends(get_db)) -> SavedLookListResponse:
    rows = db.scalars(select(Outfit).order_by(Outfit.created_at.desc()).limit(24)).all()
    unique: list[Outfit] = []
    rest: list[Outfit] = []
    seen: set[str] = set()
    for row in rows:
        if row.venue not in seen:
            unique.append(row)
            seen.add(row.venue)
        else:
            rest.append(row)
    picked = (unique + rest)[:3]
    return SavedLookListResponse(
        looks=[
            SavedLookOut(
                id=row.id,
                venue=row.venue,
                overall_score=row.overall_score,
                created_at=row.created_at,
                thumbnail_url=_thumbnail(row.items_json),
            )
            for row in picked
        ]
    )
