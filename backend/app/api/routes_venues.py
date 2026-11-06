from __future__ import annotations

from fastapi import APIRouter

from app.schemas import VENUE_INFO, VenueInfo, VenueListResponse

router = APIRouter(tags=["venues"])


@router.get("/venues", response_model=VenueListResponse)
def list_venues() -> VenueListResponse:
    return VenueListResponse(venues=[VenueInfo.model_validate(row) for row in VENUE_INFO])
