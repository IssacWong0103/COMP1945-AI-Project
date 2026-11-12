from __future__ import annotations

import base64
import json
import logging
import re
from colorsys import rgb_to_hsv
from pathlib import Path

import httpx
from PIL import Image

from app.config import settings
from app.schemas import CATEGORIES, ITEM_GENDERS, PREFERRED_STYLES, Category, ItemGender, PreferredStyle

logger = logging.getLogger(__name__)

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-flash"

SYSTEM_PROMPT = """You are a clothing cataloguer for USTyle, a campus outfit assistant for HKUST students.
Analyze the garment photo and return STRICT JSON only — no markdown, no commentary, no extra keys:
{"category":"top|bottom|outerwear|dress|shoes|accessory","color":"<dominant color name>","cut":"<silhouette>","style":"casual|smartCasual|streetwear|sporty|minimal|formal","itemGender":"male|female|unisex","description":"<short factual phrase>"}
Rules:
- category is the garment type, not the photo setting.
- color is a short English color name (e.g. navy, white, black, beige).
- cut is silhouette such as relaxed, slim, oversized, straight, cropped, tailored.
- description: under 20 words, factual, never sexual.
- If unsure, pick the closest allowed enum value.
"""

STYLING_SYSTEM_PROMPT = """You are a stylist for USTyle, a campus outfit assistant.
Look at the model photo and describe HOW the outfit is styled: layering, tucks,
cuffs, socks, accessories, and proportions. Give 1-2 short factual sentences about
styling technique only. Describe only what is visible; do not list the garments again.
"""

CATEGORY_ALIASES: dict[str, Category] = {
    "top": "top",
    "tops": "top",
    "shirt": "top",
    "shirts": "top",
    "tee": "top",
    "tshirt": "top",
    "t-shirt": "top",
    "blouse": "top",
    "sweater": "top",
    "hoodie": "top",
    "knit": "top",
    "polo": "top",
    "tank": "top",
    "bottom": "bottom",
    "bottoms": "bottom",
    "pants": "bottom",
    "trousers": "bottom",
    "jeans": "bottom",
    "shorts": "bottom",
    "skirt": "bottom",
    "skirts": "bottom",
    "chinos": "bottom",
    "joggers": "bottom",
    "outerwear": "outerwear",
    "jacket": "outerwear",
    "coat": "outerwear",
    "parka": "outerwear",
    "blazer": "outerwear",
    "cardigan": "outerwear",
    "windbreaker": "outerwear",
    "dress": "dress",
    "dresses": "dress",
    "gown": "dress",
    "jumpsuit": "dress",
    "romper": "dress",
    "shoes": "shoes",
    "shoe": "shoes",
    "sneakers": "shoes",
    "sneaker": "shoes",
    "boots": "shoes",
    "boot": "shoes",
    "loafers": "shoes",
    "heels": "shoes",
    "sandals": "shoes",
    "accessory": "accessory",
    "accessories": "accessory",
    "hat": "accessory",
    "bag": "accessory",
    "belt": "accessory",
    "scarf": "accessory",
    "watch": "accessory",
}

STYLE_ALIASES: dict[str, PreferredStyle] = {
    "casual": "casual",
    "smartcasual": "smartCasual",
    "smart_casual": "smartCasual",
    "smart-casual": "smartCasual",
    "business": "smartCasual",
    "businesscasual": "smartCasual",
    "streetwear": "streetwear",
    "street": "streetwear",
    "sporty": "sporty",
    "sport": "sporty",
    "athletic": "sporty",
    "minimal": "minimal",
    "minimalist": "minimal",
    "formal": "formal",
    "dressy": "formal",
}

GENDER_ALIASES: dict[str, ItemGender] = {
    "male": "male",
    "men": "male",
    "man": "male",
    "mens": "male",
    "female": "female",
    "women": "female",
    "woman": "female",
    "womens": "female",
    "unisex": "unisex",
}

COLOR_KEYWORDS = (
    "black",
    "white",
    "navy",
    "blue",
    "red",
    "green",
    "beige",
    "cream",
    "ivory",
    "gray",
    "grey",
    "brown",
    "khaki",
    "olive",
    "pink",
    "purple",
    "yellow",
    "orange",
    "burgundy",
    "maroon",
    "teal",
    "camel",
    "tan",
    "charcoal",
    "denim",
)


class GarmentTags(dict):
    category: Category
    color: str
    cut: str
    style: str
    item_gender: ItemGender
    description: str


def _normalize_token(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def normalize_category(value: object) -> Category:
    raw = str(value or "").strip().lower()
    token = _normalize_token(raw)
    if raw in CATEGORIES:
        return raw  # type: ignore[return-value]
    if token in CATEGORY_ALIASES:
        return CATEGORY_ALIASES[token]
    for key, mapped in CATEGORY_ALIASES.items():
        if key in raw:
            return mapped
    return "top"


def normalize_style(value: object) -> str:
    raw = str(value or "").strip()
    token = _normalize_token(raw)
    if raw in PREFERRED_STYLES:
        return raw
    if token in STYLE_ALIASES:
        return STYLE_ALIASES[token]
    return raw or "casual"


def normalize_item_gender(value: object) -> ItemGender:
    token = _normalize_token(value)
    if token in GENDER_ALIASES:
        return GENDER_ALIASES[token]
    return "unisex"


def _extract_json(text: str) -> dict:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object in VLM response")
    return json.loads(cleaned[start : end + 1])


def _image_to_data_url(raw: bytes) -> str:
    """Return a base64 data URL in a DeepSeek-supported format.

    DeepSeek vision accepts JPEG/PNG/GIF/WebP. Re-encode anything else
    (e.g. AVIF, HEIC) to PNG so mislabeled files still work.
    """
    import io

    try:
        with Image.open(io.BytesIO(raw)) as img:
            fmt = (img.format or "").upper()
        mime = {"JPEG": "jpeg", "PNG": "png", "GIF": "gif", "WEBP": "webp"}.get(fmt)
        if mime:
            return f"data:image/{mime};base64," + base64.b64encode(raw).decode("ascii")
        with Image.open(io.BytesIO(raw)) as img:
            img = img.convert("RGB")
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    except Exception:
        return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")


def _dominant_color_name(image_path: Path) -> str:
    try:
        with Image.open(image_path) as img:
            sample = img.convert("RGB").resize((48, 48), Image.Resampling.BILINEAR)
            pixels = list(sample.getdata())
    except Exception:  # noqa: BLE001
        return "unknown"

    r = sum(p[0] for p in pixels) / len(pixels)
    g = sum(p[1] for p in pixels) / len(pixels)
    b = sum(p[2] for p in pixels) / len(pixels)
    h, s, v = rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)

    if v < 0.18:
        return "black"
    if s < 0.12 and v > 0.85:
        return "white"
    if s < 0.14:
        if v < 0.4:
            return "charcoal"
        if v < 0.65:
            return "gray"
        return "beige"
    hue = h * 360
    if hue < 15 or hue >= 345:
        return "red"
    if hue < 40:
        return "orange" if v > 0.55 else "brown"
    if hue < 65:
        return "yellow" if s > 0.35 else "khaki"
    if hue < 160:
        return "olive" if v < 0.45 else "green"
    if hue < 200:
        return "teal"
    if hue < 255:
        return "navy" if v < 0.45 else "blue"
    if hue < 290:
        return "purple"
    return "pink"


def _heuristic_tags(image_path: Path, notes: str | None, original_name: str | None) -> dict:
    blob = " ".join(
        part for part in (original_name or image_path.name, notes or "") if part
    ).lower()
    blob_norm = blob.replace("-", " ").replace("_", " ")
    tokens = set(re.findall(r"[a-z0-9]+", blob_norm))
    compact = blob_norm.replace(" ", "")

    category = normalize_category(blob_norm)

    style = "casual"
    is_tee = "tshirt" in compact or "tee" in tokens
    if tokens & {"blazer", "trouser", "trousers", "chino", "chinos", "career", "office"}:
        style = "smartCasual"
    if "shirt" in tokens and not is_tee:
        style = "smartCasual"
    if tokens & {"formal", "gown", "suit", "tuxedo"} or "dressshoe" in compact:
        style = "formal"
    if tokens & {"street", "hoodie", "graphic", "streetwear"}:
        style = "streetwear"
    if tokens & {"sport", "sporty", "athletic", "jersey", "joggers", "running"}:
        style = "sporty"
    if tokens & {"minimal", "minimalist", "plain", "basic"}:
        style = "minimal"
    if notes:
        style = normalize_style(notes) if _normalize_token(notes) in STYLE_ALIASES else style

    gender = normalize_item_gender(blob_norm)

    color = next((c for c in COLOR_KEYWORDS if c in blob_norm), "")
    if not color:
        color = _dominant_color_name(image_path)

    cut = "regular"
    if tokens & {"slim", "skinny"}:
        cut = "slim"
    elif "oversize" in compact or "baggy" in tokens:
        cut = "oversized"
    elif tokens & {"relaxed", "relax", "loose"}:
        cut = "relaxed"
    elif "crop" in tokens or "cropped" in tokens:
        cut = "cropped"
    elif tokens & {"tailored", "tailor", "fitted"}:
        cut = "tailored"
    elif category == "dress":
        cut = "a-line"
    elif category == "outerwear":
        cut = "straight"
    elif category == "bottom":
        cut = "straight"

    noun = {
        "top": "top",
        "bottom": "bottoms",
        "outerwear": "outerwear",
        "dress": "dress",
        "shoes": "shoes",
        "accessory": "accessory",
    }[category]
    description = f"{color} {cut} {noun}".strip()
    if notes:
        description = f"{description}; {notes.strip()[:80]}"

    return {
        "category": category,
        "color": color,
        "cut": cut,
        "style": style,
        "itemGender": gender,
        "description": description,
    }


def _validated(payload: dict, fallback: dict) -> dict:
    return {
        "category": normalize_category(payload.get("category") or fallback["category"]),
        "color": str(payload.get("color") or fallback["color"]).strip()[:64] or fallback["color"],
        "cut": str(payload.get("cut") or fallback["cut"]).strip()[:64] or fallback["cut"],
        "style": normalize_style(payload.get("style") or fallback["style"]),
        "itemGender": normalize_item_gender(payload.get("itemGender") or payload.get("item_gender") or fallback["itemGender"]),
        "description": str(payload.get("description") or fallback["description"]).strip()[:240]
        or fallback["description"],
    }


async def describe_garment(
    image_path: Path,
    notes: str | None = None,
    original_name: str | None = None,
) -> dict:
    fallback = _heuristic_tags(image_path, notes, original_name)
    api_key = settings.deepseek_api_key.strip()
    if not api_key:
        logger.info("DEEPSEEK_API_KEY missing; using local garment heuristics")
        return fallback

    raw = image_path.read_bytes()
    data_url = _image_to_data_url(raw)
    user_text = "Describe this clothing item as strict JSON."
    if notes:
        user_text += f" User notes: {notes.strip()[:300]}"
    if original_name:
        user_text += f" Original filename: {original_name}"

    body = {
        "model": DEEPSEEK_MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(DEEPSEEK_URL, headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = _extract_json(content if isinstance(content, str) else json.dumps(content))
        return _validated(parsed, fallback)
    except Exception as exc:  # noqa: BLE001
        logger.warning("DeepSeek Flash tagging failed (%s); using heuristics", exc)
        return fallback


def describe_styling_sync(image_path: Path, venue: str, context: str) -> str | None:
    """One-shot read of how a model styled an outfit (blocking).

    Returns a short styling note, or None when the key/image is unavailable or
    the call fails. Used for the top matched model image during recommendation.
    """
    api_key = settings.deepseek_api_key.strip()
    if not api_key or not image_path.is_file():
        return None
    raw = image_path.read_bytes()
    data_url = _image_to_data_url(raw)
    user_text = (
        f"Venue: {venue}. User's outfit pieces: {context}.\n"
        "Describe how the model styled this look."
    )
    body = {
        "model": DEEPSEEK_MODEL,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": STYLING_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        response = httpx.post(DEEPSEEK_URL, headers=headers, json=body, timeout=45.0)
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        note = (content or "").strip()
        return note[:300] or None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Styling re-read failed (%s)", exc)
        return None
