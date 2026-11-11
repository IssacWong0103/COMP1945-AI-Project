from __future__ import annotations

from fastapi import APIRouter

from app.config import settings
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="ustyle",
        deepseek_configured=bool(settings.deepseek_api_key.strip()),
        kie_configured=bool(settings.kie_api_key.strip()),
        kie_public_url_ready=settings.public_uploads_reachable(),
    )
