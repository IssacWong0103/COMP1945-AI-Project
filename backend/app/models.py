from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class WardrobeItem(Base):
    __tablename__ = "wardrobe_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    image_url: Mapped[str] = mapped_column(String(512), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    color: Mapped[str] = mapped_column(String(64), nullable=False)
    cut: Mapped[str] = mapped_column(String(64), nullable=False)
    style: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    item_gender: Mapped[str] = mapped_column(String(16), nullable=False, default="unisex")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    body_photo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    height_cm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    skin_tone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    preferred_style: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)


class Outfit(Base):
    __tablename__ = "outfits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    venue: Mapped[str] = mapped_column(String(32), nullable=False)
    items_json: Mapped[str] = mapped_column(Text, nullable=False)
    venue_fit_score: Mapped[float] = mapped_column(Float, nullable=False)
    cohesion_score: Mapped[float] = mapped_column(Float, nullable=False)
    overall_score: Mapped[float] = mapped_column(Float, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")
    try_on_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    try_on_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    kie_task_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
