from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Profile
from app.schemas import GENDERS, ProfileOut
from app.services.storage import save_upload
from app.services.vlm import verify_full_body_photo

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


def _parse_number(
    raw: str | None,
    field: str,
    *,
    minimum: float,
    maximum: float,
) -> float | None:
    if raw is None or str(raw).strip() == "":
        return None
    try:
        value = float(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be a number.") from exc
    if value < minimum or value > maximum:
        raise HTTPException(status_code=400, detail=f"{field} is out of range.")
    return value


def _parse_note(raw: str | None, field: str, *, max_len: int = 80) -> str | None:
    if raw is None:
        return None
    text = " ".join(str(raw).split()).strip()
    if not text:
        return ""
    if len(text) > max_len:
        raise HTTPException(status_code=400, detail=f"{field} is too long.")
    return text


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
        dest, image_url = await save_upload(file, "profile")
        verdict = await verify_full_body_photo(dest)
        if not verdict.get("fullBody", True):
            dest.unlink(missing_ok=True)
            detail = verdict.get("reason") or "The photo does not show your full body."
            raise HTTPException(
                status_code=400,
                detail=f"Please upload a full-body photo. {detail}",
            )
        if not verdict.get("faceVisible", True):
            dest.unlink(missing_ok=True)
            detail = verdict.get("reason") or "Your face is not clearly visible."
            raise HTTPException(
                status_code=400,
                detail=f"Make sure your face is clearly visible in the photo. {detail}",
            )
        profile.body_photo_url = image_url

    if heightCm is not None:
        profile.height_cm = _parse_number(heightCm, "heightCm", minimum=100, maximum=250)
    if weightKg is not None:
        profile.weight_kg = _parse_number(weightKg, "weightKg", minimum=30, maximum=200)

    if gender is not None:
        cleaned = gender.strip()
        if cleaned == "":
            profile.gender = None
        elif cleaned not in GENDERS:
            raise HTTPException(status_code=400, detail="Invalid gender.")
        else:
            profile.gender = cleaned

    if skinTone is not None:
        note = _parse_note(skinTone, "skinTone")
        profile.skin_tone = note or None
    if preferredStyle is not None:
        note = _parse_note(preferredStyle, "preferredStyle")
        profile.preferred_style = note or None

    db.commit()
    db.refresh(profile)
    return _to_out(profile)
