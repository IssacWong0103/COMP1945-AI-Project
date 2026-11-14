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

VENUE_FORMALITY_RANGES: dict[Venue, tuple[int, int]] = {
    "lecture": (40, 50),
    "careerFair": (70, 80),
    "casualDate": (50, 70),
    "hallGathering": (20, 40),
    "formal": (91, 100),
}

VENUE_INFO = [
    {
        "id": "lecture",
        "label": "Lecture",
        "description": "Everyday class on campus — neat, comfortable, not overly dressy.",
        "formality_min": VENUE_FORMALITY_RANGES["lecture"][0],
        "formality_max": VENUE_FORMALITY_RANGES["lecture"][1],
    },
    {
        "id": "careerFair",
        "label": "Career Fair",
        "description": "Booths and networking — smart casual to business, look interview-ready.",
        "formality_min": VENUE_FORMALITY_RANGES["careerFair"][0],
        "formality_max": VENUE_FORMALITY_RANGES["careerFair"][1],
    },
    {
        "id": "casualDate",
        "label": "Casual Date",
        "description": "A relaxed date — put-together casual or streetwear, not stiff.",
        "formality_min": VENUE_FORMALITY_RANGES["casualDate"][0],
        "formality_max": VENUE_FORMALITY_RANGES["casualDate"][1],
    },
    {
        "id": "hallGathering",
        "label": "Hall Gathering",
        "description": "Hallmates hangout — casual, sporty, or streetwear you can sit around in.",
        "formality_min": VENUE_FORMALITY_RANGES["hallGathering"][0],
        "formality_max": VENUE_FORMALITY_RANGES["hallGathering"][1],
    },
    {
        "id": "formal",
        "label": "Formal",
        "description": "Ceremony, banquet, or formal dinner — polished dress or tailored looks.",
        "formality_min": VENUE_FORMALITY_RANGES["formal"][0],
        "formality_max": VENUE_FORMALITY_RANGES["formal"][1],
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
    deepseek_configured: bool | None = None
    kie_configured: bool | None = None
    kie_public_url_ready: bool | None = None


class WardrobeItemOut(CamelModel):
    id: str
    image_url: str
    category: str
    color: str
    cut: str
    style: str
    formality_score: int = Field(ge=0, le=100)
    description: str
    item_gender: str
    created_at: datetime


class WardrobeListResponse(CamelModel):
    items: list[WardrobeItemOut]


class WardrobeItemUpdate(CamelModel):
    category: str | None = None
    color: str | None = None
    cut: str | None = None
    style: str | None = None
    formality_score: int | None = Field(default=None, ge=0, le=100)
    description: str | None = None
    item_gender: str | None = None


class ProfileOut(CamelModel):
    body_photo_url: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    gender: str | None = None
    skin_tone: str | None = None
    preferred_style: str | None = None


class ProfilePhotoAnalysis(CamelModel):
    gender: str | None = None
    skin_tone: str | None = None


class VenueInfo(CamelModel):
    id: str
    label: str
    description: str
    formality_min: int = Field(ge=0, le=100)
    formality_max: int = Field(ge=0, le=100)


class VenueListResponse(CamelModel):
    venues: list[VenueInfo]


class RecommendRequest(CamelModel):
    venue: Venue
    preferred_style: str | None = Field(default=None, max_length=80)
    feedback: str | None = Field(default=None, max_length=300)
    weather: str | None = Field(default=None, max_length=40)
    time_of_day: str | None = Field(default=None, max_length=40)
    dress_code: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=200)
    use_reference: bool = True


class OutfitItemRef(CamelModel):
    id: str
    category: str
    color: str
    description: str
    image_url: str
    formality_score: int = Field(ge=0, le=100)


class RationaleItemOut(CamelModel):
    item_id: str
    reason: str


class OutfitOut(CamelModel):
    id: str
    items: list[OutfitItemRef]
    venue_fit_score: float = Field(ge=0, le=1)
    cohesion_score: float = Field(ge=0, le=1)
    overall_score: float = Field(ge=0, le=1)
    formality_score: float = Field(ge=0, le=100)
    rationale: str
    rationale_items: list[RationaleItemOut] = []
    inspiration: str | None = None
    model_reference_url: str | None = None
    try_on_url: str | None = None


class RecommendResponse(CamelModel):
    outfits: list[OutfitOut]
    elapsed_ms: int
    warning: str | None = None
    match_status: Literal["matched", "fallback"] = "matched"


class SavedLookOut(CamelModel):
    id: str
    venue: str
    overall_score: float
    created_at: datetime
    thumbnail_url: str | None = None


class SavedLookListResponse(CamelModel):
    looks: list[SavedLookOut]


class TryOnRequest(CamelModel):
    outfit_id: str


class TryOnResponse(CamelModel):
    outfit_id: str
    try_on_url: str | None
    status: str
    mode: Literal["kie", "collage"] | None = None


class TryOnHistoryItem(CamelModel):
    outfit_id: str
    venue: str
    overall_score: float
    try_on_url: str
    status: str
    created_at: datetime
    items: list[OutfitItemRef] = []


class TryOnHistoryResponse(CamelModel):
    results: list[TryOnHistoryItem]
