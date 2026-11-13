from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Outfit, Profile
from app.schemas import (
    OutfitItemRef,
    TryOnHistoryItem,
    TryOnHistoryResponse,
    TryOnRequest,
    TryOnResponse,
)
from app.services.storage import local_path_for
from app.services.tryon import generate_tryon

router = APIRouter(tags=["try-on"])


def _snapshot_items(items_json: str) -> list[OutfitItemRef]:
    try:
        snapshot = json.loads(items_json)
    except json.JSONDecodeError:
        return []
    items = snapshot.get("items") if isinstance(snapshot, dict) else snapshot
    if not isinstance(items, list):
        return []
    refs = []
    for item in items:
        if not isinstance(item, dict):
            continue
        refs.append(
            OutfitItemRef(
                id=str(item.get("id") or ""),
                category=str(item.get("category") or ""),
                color=str(item.get("color") or ""),
                description=str(item.get("description") or ""),
                image_url=str(item.get("imageUrl") or item.get("image_url") or ""),
                formality_score=int(
                    item.get("formalityScore") or item.get("formality_score") or 50
                ),
            )
        )
    return refs


@router.get("/try-ons", response_model=TryOnHistoryResponse)
def list_try_ons(db: Session = Depends(get_db)) -> TryOnHistoryResponse:
    rows = db.scalars(
        select(Outfit)
        .where(Outfit.try_on_url.is_not(None))
        .order_by(Outfit.created_at.desc())
        .limit(24)
    ).all()
    results = []
    for row in rows:
        url = row.try_on_url or ""
        if url.startswith("/uploads/") and local_path_for(url) is None:
            continue
        results.append(
            TryOnHistoryItem(
                outfit_id=row.id,
                venue=row.venue,
                overall_score=row.overall_score,
                try_on_url=url,
                status=row.try_on_status or "ready",
                created_at=row.created_at,
                items=_snapshot_items(row.items_json),
            )
        )
    return TryOnHistoryResponse(results=results)


@router.post("/try-on", response_model=TryOnResponse)
async def create_try_on(payload: TryOnRequest, db: Session = Depends(get_db)) -> TryOnResponse:
    outfit = db.get(Outfit, payload.outfit_id)
    if outfit is None:
        raise HTTPException(status_code=404, detail="Outfit not found. Recommend an outfit first.")

    if outfit.try_on_url and outfit.try_on_status == "ready":
        return TryOnResponse(outfit_id=outfit.id, try_on_url=outfit.try_on_url, status="ready")

    try:
        snapshot = json.loads(outfit.items_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Stored outfit is invalid.") from exc

    items = snapshot.get("items") if isinstance(snapshot, dict) else snapshot
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="Outfit has no garments to try on.")

    styling_note = snapshot.get("inspiration") if isinstance(snapshot, dict) else None
    model_reference_url = snapshot.get("modelReferenceUrl") if isinstance(snapshot, dict) else None

    profile = db.get(Profile, 1)
    body_photo = profile.body_photo_url if profile else None
    if not body_photo:
        raise HTTPException(
            status_code=400,
            detail="Upload a full-body photo in your profile before trying on an outfit.",
        )

    try:
        status, try_on_url, task_id = await generate_tryon(
            outfit_id=outfit.id,
            body_photo_url=body_photo,
            garments=items,
            styling_note=styling_note,
            model_reference_url=model_reference_url,
            gender=profile.gender if profile else None,
            skin_tone=profile.skin_tone if profile else None,
            height_cm=profile.height_cm if profile else None,
            weight_kg=profile.weight_kg if profile else None,
            existing_task_id=outfit.kie_task_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Try-on failed: {exc}") from exc

    outfit.try_on_status = status
    outfit.try_on_url = try_on_url
    if task_id:
        outfit.kie_task_id = task_id
    db.commit()

    return TryOnResponse(outfit_id=outfit.id, try_on_url=try_on_url, status=status)
