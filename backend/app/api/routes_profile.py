from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Profile
from app.schemas import GENDERS, PREFERRED_STYLES, SKIN_TONES, ProfileOut
from app.services.storage import save_upload

router = APIRouter(prefix="/profile", tags=["profile"])

DEFAULT_PROFILE_ID = 1


def get_or_create_profile(db: Session) -> Profile:
    profile = db.get(Profile, DEFAULT_PROFILE_ID)
    if profile is None:
        profile = Profile(id=DEFAULT_PROFILE_ID)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _to_out(profile: Profile | None) -> ProfileOut:
    if profile is None:
        return ProfileOut()
    return ProfileOut.model_validate(profile)


def _parse_number(raw: str | None, field: str) -> float | None:
    if raw is None or str(raw).strip() == "":
        return None
    try:
        value = float(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be a number.") from exc
    if value <= 0 or value > 500:
        raise HTTPException(status_code=400, detail=f"{field} is out of range.")
    return value


@router.get("", response_model=ProfileOut)
def read_profile(db: Session = Depends(get_db)) -> ProfileOut:
    profile = db.scalars(select(Profile).limit(1)).first()
    return _to_out(profile)


@router.put("", response_model=ProfileOut)
async def update_profile(
    file: UploadFile | None = File(None),
    heightCm: str | None = Form(None),
    weightKg: str | None = Form(None),
    gender: str | None = Form(None),
    skinTone: str | None = Form(None),
    preferredStyle: str | None = Form(None),
    db: Session = Depends(get_db),
) -> ProfileOut:
    profile = get_or_create_profile(db)

    if file is not None and file.filename:
        _, image_url = await save_upload(file, "profile")
        profile.body_photo_url = image_url

    height = _parse_number(heightCm, "heightCm")
    if height is not None:
        profile.height_cm = height
    weight = _parse_number(weightKg, "weightKg")
    if weight is not None:
        profile.weight_kg = weight

    if gender:
        if gender not in GENDERS:
            raise HTTPException(status_code=400, detail="Invalid gender.")
        profile.gender = gender
    if skinTone:
        if skinTone not in SKIN_TONES:
            raise HTTPException(status_code=400, detail="Invalid skinTone.")
        profile.skin_tone = skinTone
    if preferredStyle:
        if preferredStyle not in PREFERRED_STYLES:
            raise HTTPException(status_code=400, detail="Invalid preferredStyle.")
        profile.preferred_style = preferredStyle

    db.commit()
    db.refresh(profile)
    return _to_out(profile)
