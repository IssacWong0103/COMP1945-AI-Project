from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import WardrobeItem
from app.schemas import (
    CATEGORIES,
    ITEM_GENDERS,
    PREFERRED_STYLES,
    WardrobeItemOut,
    WardrobeItemUpdate,
    WardrobeListResponse,
)
from app.services.storage import local_path_for, save_upload
from app.services.vlm import describe_garment

router = APIRouter(prefix="/wardrobe", tags=["wardrobe"])


def _to_out(item: WardrobeItem) -> WardrobeItemOut:
    return WardrobeItemOut.model_validate(item)


@router.post("/items", response_model=WardrobeItemOut, status_code=201)
async def create_item(
    file: UploadFile = File(...),
    notes: str | None = Form(None),
    db: Session = Depends(get_db),
) -> WardrobeItemOut:
    dest, image_url = await save_upload(file, "wardrobe")
    tags = await describe_garment(dest, notes=notes, original_name=file.filename)
    if not tags.get("isSingleItem", True):
        dest.unlink(missing_ok=True)
        reason = str(tags.get("rejectionReason") or "").strip()
        detail = "Upload one clothing item on its own (a pair of shoes is fine), not a model, outfit, or multiple items."
        raise HTTPException(status_code=400, detail=f"{detail} {reason}".strip())
    item = WardrobeItem(
        id=str(uuid4()),
        image_url=image_url,
        category=tags["category"],
        color=tags["color"],
        cut=tags["cut"],
        style=tags["style"],
        formality_score=tags["formalityScore"],
        description=tags["description"],
        item_gender=tags["itemGender"],
        notes=(notes or "").strip() or None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.get("/items", response_model=WardrobeListResponse)
def list_items(db: Session = Depends(get_db)) -> WardrobeListResponse:
    rows = db.scalars(select(WardrobeItem).order_by(WardrobeItem.created_at.desc())).all()
    return WardrobeListResponse(items=[_to_out(row) for row in rows])


@router.patch("/items/{item_id}", response_model=WardrobeItemOut)
def update_item(
    item_id: str,
    payload: WardrobeItemUpdate,
    db: Session = Depends(get_db),
) -> WardrobeItemOut:
    item = db.get(WardrobeItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Wardrobe item not found.")

    data = payload.model_dump(exclude_unset=True)
    if "category" in data:
        category = (data["category"] or "").strip()
        if category not in CATEGORIES:
            raise HTTPException(
                status_code=400,
                detail="Category must be top, bottom, outerwear, dress, shoes, or accessory.",
            )
        data["category"] = category
    if "style" in data:
        style = (data["style"] or "").strip()
        if style not in PREFERRED_STYLES:
            raise HTTPException(
                status_code=400,
                detail="Style must be casual, smart casual, streetwear, sporty, minimal, or formal.",
            )
        data["style"] = style
    if "item_gender" in data:
        gender = (data["item_gender"] or "").strip()
        if gender not in ITEM_GENDERS:
            raise HTTPException(
                status_code=400,
                detail="Fits must be male, female, or unisex.",
            )
        data["item_gender"] = gender
    if "color" in data:
        data["color"] = (data["color"] or "").strip()
    if "cut" in data:
        data["cut"] = (data["cut"] or "").strip()
    if "description" in data:
        data["description"] = (data["description"] or "").strip()

    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: str, db: Session = Depends(get_db)) -> Response:
    item = db.get(WardrobeItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Wardrobe item not found.")
    path = local_path_for(item.image_url)
    db.delete(item)
    db.commit()
    if path:
        Path(path).unlink(missing_ok=True)
    return Response(status_code=204)
