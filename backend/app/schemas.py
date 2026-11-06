from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Venue = Literal["lecture", "careerFair", "casualDate", "hallGathering", "formal"]
Gender = Literal["male", "female", "nonBinary", "preferNot"]
ItemGender = Literal["male", "female", "unisex"]
SkinTone = Literal["fair", "light", "medium", "tan", "deep"]
PreferredStyle = Literal[
    "casual",
    "smartCasual",
    "streetwear",
    "sporty",
    "minimal",
    "formal",
]
Category = Literal["top", "bottom", "outerwear", "dress", "shoes", "accessory"]

VENUES: tuple[Venue, ...] = (
    "lecture",
    "careerFair",
    "casualDate",
    "hallGathering",
    "formal",
)
CATEGORIES: tuple[Category, ...] = (
    "top",
    "bottom",
    "outerwear",
    "dress",
    "shoes",
    "accessory",
)
ITEM_GENDERS: tuple[ItemGender, ...] = ("male", "female", "unisex")
PREFERRED_STYLES: tuple[PreferredStyle, ...] = (
    "casual",
    "smartCasual",
    "streetwear",
    "sporty",
    "minimal",
    "formal",
)
GENDERS: tuple[Gender, ...] = ("male", "female", "nonBinary", "preferNot")
SKIN_TONES: tuple[SkinTone, ...] = ("fair", "light", "medium", "tan", "deep")

VENUE_INFO = [
    {
        "id": "lecture",
        "label": "Lecture",
        "description": "Everyday class on campus — neat, comfortable, not overly dressy.",
    },
    {
        "id": "careerFair",
        "label": "Career Fair",
        "description": "Booths and networking — smart casual to business, look interview-ready.",
    },
    {
        "id": "casualDate",
        "label": "Casual Date",
        "description": "A relaxed date — put-together casual or streetwear, not stiff.",
    },
    {
        "id": "hallGathering",
        "label": "Hall Gathering",
        "description": "Hallmates hangout — casual, sporty, or streetwear you can sit around in.",
    },
    {
        "id": "formal",
        "label": "Formal",
        "description": "Ceremony, banquet, or formal dinner — polished dress or tailored looks.",
    },
]


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class HealthResponse(CamelModel):
    status: str
    service: str


class WardrobeItemOut(CamelModel):
    id: str
    image_url: str
    category: str
    color: str
    cut: str
    style: str
    description: str
    item_gender: str
    created_at: datetime


class WardrobeListResponse(CamelModel):
    items: list[WardrobeItemOut]


class ProfileOut(CamelModel):
    body_photo_url: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    gender: str | None = None
    skin_tone: str | None = None
    preferred_style: str | None = None


class VenueInfo(CamelModel):
    id: str
    label: str
    description: str


class VenueListResponse(CamelModel):
    venues: list[VenueInfo]


class RecommendRequest(CamelModel):
    venue: Venue
    preferred_style: PreferredStyle | None = None


class OutfitItemRef(CamelModel):
    id: str
    category: str
    color: str
    description: str
    image_url: str


class OutfitOut(CamelModel):
    id: str
    items: list[OutfitItemRef]
    venue_fit_score: float = Field(ge=0, le=1)
    cohesion_score: float = Field(ge=0, le=1)
    overall_score: float = Field(ge=0, le=1)
    rationale: str
    try_on_url: str | None = None


class RecommendResponse(CamelModel):
    outfits: list[OutfitOut]
    elapsed_ms: int
    warning: str | None = None


class TryOnRequest(CamelModel):
    outfit_id: str


class TryOnResponse(CamelModel):
    outfit_id: str
    try_on_url: str | None
    status: str
