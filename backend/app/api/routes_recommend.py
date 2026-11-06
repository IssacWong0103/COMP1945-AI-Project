from __future__ import annotations

from datetime import datetime, timezone
from time import perf_counter

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Outfit, Profile, WardrobeItem
from app.schemas import OutfitOut, RecommendRequest, RecommendResponse
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
    outfits, warning = recommend_outfits(items, payload.venue, preferred)
    for outfit in outfits:
        _persist(db, outfit, payload.venue)
    db.commit()
    elapsed_ms = int((perf_counter() - started) * 1000)
    return RecommendResponse(outfits=outfits, elapsed_ms=elapsed_ms, warning=warning)
