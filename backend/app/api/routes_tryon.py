from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Outfit, Profile
from app.schemas import TryOnRequest, TryOnResponse
from app.services.tryon import generate_tryon

router = APIRouter(tags=["try-on"])


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
            face_photo_url=profile.face_photo_url if profile else None,
            garments=items,
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
