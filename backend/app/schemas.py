from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_serializer, model_validator
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
SearchMode = Literal["textThenPhotos", "simpleFallback"]
TryOnStatus = Literal["ready", "processing", "failed"]
TryOnResultKind = Literal["generated", "collage"]
TryOnFallbackReason = Literal[
    "local_images_not_public",
    "provider_error",
    "timeout",
    "missing_key",
    "missing_inputs",
]

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


class WardrobeItemUpdate(CamelModel):
    category: str | None = None
    color: str | None = None
    cut: str | None = None
    style: str | None = None
    description: str | None = None
    item_gender: str | None = None


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
    preferred_style: str | None = Field(default=None, max_length=80)


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
    # Wording or id for the chosen look. Omitted until a fashion-photo text catalog is wired in.
    style_reference: str | None = None

    @model_serializer(mode="wrap")
    def _omit_empty_style_reference(self, handler, _info):
        data = handler(self)
        if not isinstance(data, dict):
            return data
        reference = (self.style_reference or "").strip()
        if not reference:
            data.pop("styleReference", None)
            data.pop("style_reference", None)
        return data


class RecommendResponse(CamelModel):
    outfits: list[OutfitOut]
    elapsed_ms: int
    warning: str | None = None
    # simpleFallback until matching can search a fashion-photo text catalog, then textThenPhotos.
    search_mode: SearchMode | None = "simpleFallback"


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
    # True only when the student asked to "Show a local preview instead."
    accept_preview: bool = False


class TryOnResponse(CamelModel):
    outfit_id: str
    try_on_url: str | None
    status: TryOnStatus
    # Required whenever status is ready and tryOnUrl is present.
    result_kind: TryOnResultKind | None = None
    fallback_reason: TryOnFallbackReason | None = None
    style_reference_url: str | None = None
    detail: str | None = None

    @model_validator(mode="after")
    def ready_image_names_its_kind(self) -> TryOnResponse:
        if self.status == "ready" and self.try_on_url and not self.result_kind:
            raise ValueError("resultKind is required when status is ready and tryOnUrl is set")
        return self
