from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import (
    routes_eval,
    routes_health,
    routes_profile,
    routes_recommend,
    routes_tryon,
    routes_venues,
    routes_wardrobe,
)
from app.config import CORS_ORIGINS, settings
from app.db import init_db
from app.services.storage import ensure_upload_dirs


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_upload_dirs()
    init_db()
    yield


app = FastAPI(
    title="USTyle",
    description="AI outfit assistant for HKUST students (COMP1945 Group 18)",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_health.router, prefix="/api")
app.include_router(routes_venues.router, prefix="/api")
app.include_router(routes_wardrobe.router, prefix="/api")
app.include_router(routes_profile.router, prefix="/api")
app.include_router(routes_recommend.router, prefix="/api")
app.include_router(routes_tryon.router, prefix="/api")
app.include_router(routes_eval.router, prefix="/api")

ensure_upload_dirs()
init_db()
app.mount("/uploads", StaticFiles(directory=str(settings.uploads_dir)), name="uploads")


@app.exception_handler(RequestValidationError)
async def validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    if not errors:
        return JSONResponse(status_code=422, content={"detail": "Invalid request."})
    first = errors[0]
    loc_parts = [str(part) for part in first.get("loc", ()) if part not in {"body", "query", "path"}]
    location = ".".join(loc_parts)
    message = str(first.get("msg") or "Invalid request.")
    detail = f"{location}: {message}" if location else message
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(HTTPException)
async def http_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": detail})
