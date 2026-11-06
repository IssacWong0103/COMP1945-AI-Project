from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import WardrobeItem
from app.schemas import WardrobeItemOut, WardrobeListResponse
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
    item = WardrobeItem(
        id=str(uuid4()),
        image_url=image_url,
        category=tags["category"],
        color=tags["color"],
        cut=tags["cut"],
        style=tags["style"],
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
