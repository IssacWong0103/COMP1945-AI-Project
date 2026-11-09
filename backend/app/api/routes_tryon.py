from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Outfit, Profile
from app.schemas import TryOnFallbackReason, TryOnRequest, TryOnResponse, TryOnResultKind
from app.services.tryon import TryOnResult, generate_tryon

router = APIRouter(tags=["try-on"])

_FALLBACK_REASONS = {
    "local_images_not_public",
    "provider_error",
    "timeout",
    "missing_key",
    "missing_inputs",
}
_RESULT_KINDS = {"generated", "collage"}


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _fallback_reason(value: str | None) -> TryOnFallbackReason | None:
    text = _clean(value)
    if text in _FALLBACK_REASONS:
        return text  # type: ignore[return-value]
    return None


def _result_kind(value: str | None) -> TryOnResultKind | None:
    text = _clean(value)
    if text in _RESULT_KINDS:
        return text  # type: ignore[return-value]
    return None


def _style_reference_url(snapshot: object) -> str | None:
    if not isinstance(snapshot, dict):
        return None
    raw = snapshot.get("styleReferenceUrl") or snapshot.get("style_reference_url")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def _response_from_row(outfit: Outfit) -> TryOnResponse:
    return TryOnResponse(
        outfit_id=outfit.id,
        try_on_url=_clean(outfit.try_on_url),
        status="ready",
        result_kind=_result_kind(outfit.try_on_result_kind),
        fallback_reason=_fallback_reason(outfit.try_on_fallback_reason),
        style_reference_url=_clean(outfit.try_on_style_reference_url),
        detail=_clean(outfit.try_on_detail),
    )


def _cached_tryon(outfit: Outfit, *, accept_preview: bool) -> TryOnResponse | None:
    """Serve a stored ready image only when its kind is known.

    A collage is a local preview. Return it only when this request asked for one,
    so a later generate call is not presented as a successful try-on.
    """
    if outfit.try_on_status != "ready" or not _clean(outfit.try_on_url):
        return None
    kind = _result_kind(outfit.try_on_result_kind)
    if kind == "generated":
        return _response_from_row(outfit)
    if kind == "collage" and accept_preview:
        return _response_from_row(outfit)
    return None


def _persist(outfit: Outfit, result: TryOnResult) -> None:
    keep_collage = (
        result.status != "ready"
        and outfit.try_on_status == "ready"
        and outfit.try_on_result_kind == "collage"
        and bool(_clean(outfit.try_on_url))
    )
    if result.fallback_reason == "provider_error":
        outfit.kie_task_id = None
    elif result.task_id:
        outfit.kie_task_id = result.task_id
    if keep_collage:
        return
    outfit.try_on_status = result.status
    outfit.try_on_url = result.try_on_url
    outfit.try_on_result_kind = result.result_kind
    outfit.try_on_fallback_reason = result.fallback_reason
    outfit.try_on_detail = result.detail
    outfit.try_on_style_reference_url = result.style_reference_url


def _response_from_result(outfit_id: str, result: TryOnResult) -> TryOnResponse:
    return TryOnResponse(
        outfit_id=outfit_id,
        try_on_url=result.try_on_url,
        status=result.status,  # type: ignore[arg-type]
        result_kind=_result_kind(result.result_kind),
        fallback_reason=_fallback_reason(result.fallback_reason),
        style_reference_url=_clean(result.style_reference_url),
        detail=_clean(result.detail),
    )


@router.post("/try-on", response_model=TryOnResponse)
async def create_try_on(payload: TryOnRequest, db: Session = Depends(get_db)) -> TryOnResponse:
    outfit = db.get(Outfit, payload.outfit_id)
    if outfit is None:
        raise HTTPException(status_code=400, detail="Outfit not found. Recommend an outfit first.")

    cached = _cached_tryon(outfit, accept_preview=payload.accept_preview)
    if cached is not None:
        return cached

    try:
        snapshot = json.loads(outfit.items_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Stored outfit is invalid.") from exc

    items = snapshot.get("items") if isinstance(snapshot, dict) else snapshot
    if not isinstance(items, list) or not items or not all(isinstance(item, dict) for item in items):
        raise HTTPException(status_code=400, detail="Outfit has no garments to try on.")

    profile = db.get(Profile, 1)
    body_photo = profile.body_photo_url if profile else None
    if not body_photo:
        raise HTTPException(
            status_code=400,
            detail="Upload a full-body photo in your profile before trying on an outfit.",
        )

    resume_id = None
    if outfit.kie_task_id and (
        outfit.try_on_status == "processing" or outfit.try_on_fallback_reason == "timeout"
    ):
        resume_id = outfit.kie_task_id

    result = await generate_tryon(
        outfit_id=outfit.id,
        body_photo_url=body_photo,
        garments=items,
        gender=profile.gender if profile else None,
        skin_tone=profile.skin_tone if profile else None,
        height_cm=profile.height_cm if profile else None,
        weight_kg=profile.weight_kg if profile else None,
        existing_task_id=resume_id,
        accept_preview=payload.accept_preview,
        style_reference_url=_style_reference_url(snapshot),
    )

    _persist(outfit, result)
    db.commit()
    return _response_from_result(outfit.id, result)
