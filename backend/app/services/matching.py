from __future__ import annotations

import json
import logging
import random
import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from functools import lru_cache
from itertools import product
from pathlib import Path

from app.config import settings
from app.models import WardrobeItem
from app.schemas import PREFERRED_STYLES, OutfitItemRef, OutfitOut, RationaleItemOut
from app.services import fashion_index
from app.services import vlm

logger = logging.getLogger(__name__)

MAX_CORE_LOOKS = 80
MAX_RETURN = 3
MIN_RETURN = 2
REFERENCE_BOOST = 0.08

NEUTRALS = {
    "black",
    "white",
    "gray",
    "grey",
    "navy",
    "beige",
    "cream",
    "ivory",
    "khaki",
    "brown",
    "tan",
    "camel",
    "charcoal",
    "stone",
    "nude",
    "olive",
    "offwhite",
    "denim",
}

VENUE_STYLE_SCORES: dict[str, dict[str, float]] = {
    "lecture": {
        "casual": 1.0,
        "smartCasual": 0.92,
        "minimal": 1.0,
        "streetwear": 0.55,
        "sporty": 0.45,
        "formal": 0.28,
    },
    "careerFair": {
        "smartCasual": 1.0,
        "formal": 0.98,
        "minimal": 0.78,
        "casual": 0.32,
        "streetwear": 0.18,
        "sporty": 0.12,
    },
    "casualDate": {
        "casual": 0.95,
        "smartCasual": 1.0,
        "streetwear": 0.88,
        "minimal": 0.8,
        "sporty": 0.4,
        "formal": 0.35,
    },
    "hallGathering": {
        "casual": 1.0,
        "streetwear": 0.95,
        "sporty": 0.92,
        "minimal": 0.55,
        "smartCasual": 0.35,
        "formal": 0.12,
    },
    "formal": {
        "formal": 1.0,
        "smartCasual": 0.7,
        "minimal": 0.55,
        "casual": 0.18,
        "streetwear": 0.1,
        "sporty": 0.05,
    },
}

VENUE_KEYWORDS: dict[str, tuple[tuple[str, float], ...]] = {
    "lecture": (
        ("hoodie", 0.04),
        ("tee", 0.04),
        ("jeans", 0.05),
        ("knit", 0.05),
        ("sneaker", 0.03),
        ("blazer", -0.04),
        ("gown", -0.08),
        ("heel", -0.05),
    ),
    "careerFair": (
        ("shirt", 0.1),
        ("blouse", 0.1),
        ("blazer", 0.12),
        ("trouser", 0.1),
        ("chino", 0.08),
        ("oxford", 0.08),
        ("hoodie", -0.12),
        ("shorts", -0.14),
        ("graphic", -0.08),
        ("joggers", -0.12),
        ("sneaker", -0.04),
    ),
    "casualDate": (
        ("knit", 0.05),
        ("denim", 0.04),
        ("dress", 0.06),
        ("jacket", 0.03),
        ("hoodie", 0.02),
    ),
    "hallGathering": (
        ("hoodie", 0.08),
        ("tee", 0.05),
        ("joggers", 0.07),
        ("shorts", 0.05),
        ("sneaker", 0.05),
        ("jersey", 0.06),
        ("blazer", -0.1),
        ("heel", -0.08),
        ("gown", -0.12),
    ),
    "formal": (
        ("dress", 0.14),
        ("blazer", 0.12),
        ("suit", 0.14),
        ("shirt", 0.06),
        ("trouser", 0.08),
        ("heel", 0.06),
        ("coat", 0.06),
        ("hoodie", -0.16),
        ("shorts", -0.18),
        ("joggers", -0.16),
        ("graphic", -0.1),
        ("sneaker", -0.08),
    ),
}


@dataclass
class Candidate:
    items: list[WardrobeItem]
    venue_fit: float
    cohesion: float
    overall: float
    rationale: str
    warning: str | None = None
    item_ids: frozenset[str] = field(init=False)

    def __post_init__(self) -> None:
        self.item_ids = frozenset(item.id for item in self.items)


def _tokenize(*parts: str) -> set[str]:
    blob = " ".join(p for p in parts if p).lower()
    return {tok for tok in re.findall(r"[a-z0-9]+", blob) if len(tok) > 1}


def _color_tokens(color: str) -> set[str]:
    return {tok for tok in re.findall(r"[a-z]+", color.lower()) if tok}


def _is_neutral(color: str) -> bool:
    return bool(_color_tokens(color) & NEUTRALS)


@lru_cache(maxsize=1)
def load_reference_outfits() -> list[dict]:
    path: Path = settings.reference_outfits_path
    if not path.is_file():
        logger.warning("reference_outfits.json missing at %s", path)
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        logger.exception("Failed to parse reference_outfits.json")
        return []
    return data if isinstance(data, list) else []


def _by_category(items: Sequence[WardrobeItem]) -> dict[str, list[WardrobeItem]]:
    grouped: dict[str, list[WardrobeItem]] = {
        "top": [],
        "bottom": [],
        "outerwear": [],
        "dress": [],
        "shoes": [],
        "accessory": [],
    }
    for item in items:
        grouped.setdefault(item.category, []).append(item)
    return grouped


def _sample(items: list[WardrobeItem], limit: int, rng: random.Random) -> list[WardrobeItem]:
    if len(items) <= limit:
        return list(items)
    return rng.sample(items, limit)


def generate_cores(items: Sequence[WardrobeItem], rng: random.Random) -> list[list[WardrobeItem]]:
    grouped = _by_category(items)
    tops = _sample(grouped["top"], 12, rng)
    bottoms = _sample(grouped["bottom"], 12, rng)
    dresses = _sample(grouped["dress"], 8, rng)

    cores: list[list[WardrobeItem]] = []
    for top, bottom in product(tops, bottoms):
        cores.append([top, bottom])
    for dress in dresses:
        cores.append([dress])

    if not cores:
        leftover = [item for item in items if item.category not in {"accessory"}]
        if leftover:
            cores.append(leftover[:3])
    if len(cores) > MAX_CORE_LOOKS:
        cores = rng.sample(cores, MAX_CORE_LOOKS)
    return cores


def _style_tokens(value: str) -> set[str]:
    spaced = re.sub(r"([A-Z])", r" \1", value)
    parts = re.split(r"[^a-zA-Z0-9]+", spaced.lower())
    return {part for part in parts if len(part) >= 3}


def _item_matches_preferred(item: WardrobeItem, preferred_style: str) -> bool:
    if item.style == preferred_style:
        return True
    if preferred_style in PREFERRED_STYLES:
        return False
    tokens = _style_tokens(preferred_style)
    if not tokens:
        return False
    blob = _blob(item)
    return any(token in blob for token in tokens)


def _style_score(style: str, venue: str) -> float:
    table = VENUE_STYLE_SCORES.get(venue, {})
    if style in table:
        return table[style]
    return 0.4


def _blob(item: WardrobeItem) -> str:
    return " ".join(
        (
            item.category,
            item.color,
            item.cut,
            item.style,
            item.description,
            item.item_gender,
        )
    ).lower()


def venue_fit_score(
    items: Sequence[WardrobeItem],
    venue: str,
    preferred_style: str | None,
) -> float:
    if not items:
        return 0.0
    style_vals = [_style_score(item.style, venue) for item in items]
    score = sum(style_vals) / len(style_vals)

    blob = " ".join(_blob(item) for item in items)
    for keyword, delta in VENUE_KEYWORDS.get(venue, ()):
        if keyword in blob:
            score += delta

    categories = {item.category for item in items}
    if venue == "formal" and "dress" in categories:
        score += 0.08
    if venue == "careerFair" and any("shirt" in _blob(i) or "blouse" in _blob(i) for i in items):
        score += 0.06
    if venue in {"lecture", "hallGathering"} and "dress" in categories and "formal" in blob:
        score -= 0.06

    if preferred_style:
        pref_hits = sum(1 for item in items if _item_matches_preferred(item, preferred_style))
        score += 0.06 * (pref_hits / len(items))

    complete = ("top" in categories and "bottom" in categories) or ("dress" in categories)
    if complete:
        score += 0.05
    else:
        score -= 0.18
    if "shoes" in categories:
        score += 0.03

    return max(0.0, min(1.0, score))


def cohesion_score(items: Sequence[WardrobeItem], preferred_style: str | None) -> float:
    if not items:
        return 0.0
    categories = [item.category for item in items]
    if categories.count("bottom") > 1:
        return 0.05
    if "dress" in categories and "top" in categories:
        return 0.12
    if "dress" in categories and "bottom" in categories:
        return 0.12

    score = 0.55

    accent_colors = [item.color for item in items if not _is_neutral(item.color)]
    unique_accents = {c.lower() for c in accent_colors}
    if len(unique_accents) <= 1:
        score += 0.22
    elif len(unique_accents) == 2:
        score += 0.08
    else:
        score -= 0.12

    styles = [item.style for item in items]
    majority = max(set(styles), key=styles.count)
    agreement = styles.count(majority) / len(styles)
    score += 0.18 * agreement
    if preferred_style:
        if majority == preferred_style:
            score += 0.05
        elif preferred_style not in PREFERRED_STYLES:
            custom_hits = sum(1 for item in items if _item_matches_preferred(item, preferred_style))
            if custom_hits / len(items) >= 0.5:
                score += 0.05

    genders = {item.item_gender for item in items if item.item_gender != "unisex"}
    if len(genders) > 1:
        score -= 0.08

    cuts = [item.cut.lower() for item in items]
    if any("oversize" in c for c in cuts) and any(c in {"slim", "skinny", "tailored"} for c in cuts):
        score -= 0.04

    if len(items) >= 2:
        score += 0.04
    return max(0.0, min(1.0, score))


def _outfit_tokens(items: Sequence[WardrobeItem]) -> set[str]:
    tokens: set[str] = set()
    for item in items:
        tokens |= _tokenize(item.category, item.color, item.cut, item.style, item.description)
    return tokens


def _outfit_text(items: Sequence[WardrobeItem]) -> str:
    return " ".join(
        " ".join((item.category, item.color, item.cut, item.style, item.description))
        for item in items
    )


def reference_similarity(items: Sequence[WardrobeItem], venue: str) -> float:
    return _best_reference(items, venue)[1]


def _best_reference(
    items: Sequence[WardrobeItem], venue: str
) -> tuple[dict | None, float]:
    caption, score = fashion_index.best_caption(_outfit_text(items), venue)
    if caption is not None and score > 0:
        return caption, score

    # Fallback: hand-seeded reference outfits (used when captions are missing).
    refs = load_reference_outfits()
    outfit_tokens = _outfit_tokens(items)
    if not refs or not outfit_tokens:
        return None, 0.0
    best_ref: dict | None = None
    best = 0.0
    for ref in refs:
        ref_venues = set(ref.get("venues") or [])
        if ref_venues and venue not in ref_venues:
            weight = 0.55
        else:
            weight = 1.0
        ref_tokens = _tokenize(
            str(ref.get("tokens") or ""),
            str(ref.get("style") or ""),
            str(ref.get("fashionDbCategory") or ""),
            " ".join(
                f"{piece.get('category', '')} {piece.get('color', '')} {piece.get('tokens', '')}"
                for piece in (ref.get("items") or [])
            ),
        )
        if not ref_tokens:
            continue
        overlap = len(outfit_tokens & ref_tokens) / len(outfit_tokens | ref_tokens)
        score = overlap * weight
        if score > best:
            best = score
            best_ref = ref
    return best_ref, best


def _rationale(
    items: Sequence[WardrobeItem],
    venue: str,
    venue_fit: float,
    cohesion: float,
) -> str:
    labels = {
        "lecture": "lecture",
        "careerFair": "career fair",
        "casualDate": "casual date",
        "hallGathering": "hall gathering",
        "formal": "formal event",
    }
    venue_label = labels.get(venue, venue)
    bits = []
    for item in items:
        bits.append(f"{item.color} {item.category}")
    palette = ", ".join(bits)
    if cohesion >= 0.75:
        harmony = "colors stay mostly neutral with a single accent"
    elif cohesion >= 0.55:
        harmony = "styles mostly agree"
    else:
        harmony = "this is a workable combo from a small wardrobe"
    if venue_fit >= 0.75:
        fit = f"strong {venue_label} fit"
    elif venue_fit >= 0.5:
        fit = f"reasonable {venue_label} fit"
    else:
        fit = f"best available option for a {venue_label}"
    return f"{palette.capitalize()} — {fit}; {harmony}."


HEAVY_FABRICS = ("coat", "jacket", "hoodie", "sweater", "knit", "cardigan", "parka", "windbreaker", "blazer")
LIGHT_FABRICS = ("tee", "t-shirt", "shirt", "shorts", "linen", "sleeveless", "tank")


def _feedback_delta(items: Sequence[WardrobeItem], feedback: str | None) -> float:
    """Translate free-form refinement feedback into a small score adjustment.

    Deliberately small (≤ ±0.25) so it re-ranks candidates rather than
    overriding the venue/style heuristics.
    """
    if not feedback:
        return 0.0
    text = " ".join(feedback.lower().split())
    if not text:
        return 0.0

    blob = " ".join(_blob(item) for item in items)
    styles = {item.style for item in items}
    colors = [item.color.lower() for item in items]
    neutral_count = sum(1 for c in colors if _is_neutral(c))
    delta = 0.0

    def has(*words: str) -> bool:
        return any(word in text for word in words)

    # Formality direction
    if has("too formal", "dressier", "less formal", "more casual", "casualize"):
        delta += 0.10 * ("casual" in styles) + 0.06 * ("smartCasual" in styles) + 0.04 * ("minimal" in styles)
        delta -= 0.12 * ("formal" in styles)
    if has("too casual", "smarter", "more formal", "dressed up", "dressier", "elevate"):
        delta += 0.12 * ("formal" in styles) + 0.08 * ("smartCasual" in styles)
        delta -= 0.10 * (bool(styles & {"casual", "sporty", "streetwear"}))

    # Temperature
    if has("too warm", "too hot", "hot weather", "summer", "lighter", "too heavy"):
        delta -= 0.10 * sum(1 for word in HEAVY_FABRICS if word in blob)
        delta += 0.06 * sum(1 for word in LIGHT_FABRICS if word in blob)
    if has("too cold", "not warm", "winter", "freezing", "add layers", "layer"):
        delta += 0.08 * sum(1 for word in HEAVY_FABRICS if word in blob)

    # Color direction
    if has("more color", "too plain", "too boring", "colorful", "brighter", "pop"):
        accent_count = len([c for c in colors if not _is_neutral(c)])
        delta += 0.08 * accent_count
        delta -= 0.06 * neutral_count
    if has("less color", "too loud", "too much color", "tone down", "neutral", "muted"):
        delta += 0.06 * neutral_count
        delta -= 0.08 * (len(colors) - neutral_count)

    # Garment swaps
    if has("different shoes", "change the shoes", "other shoes", "no sneakers"):
        if "loafer" in blob or "heel" in blob or "boot" in blob:
            delta += 0.08
        if "sneaker" in blob:
            delta -= 0.10
    if has("no jacket", "drop the jacket", "no blazer", "remove the jacket"):
        delta -= 0.12 * sum(1 for item in items if item.category == "outerwear")
    if has("add jacket", "add a jacket", "need outerwear", "with a jacket"):
        delta += 0.10 * sum(1 for item in items if item.category == "outerwear")
    if has("dress", "wear a dress"):
        delta += 0.10 * sum(1 for item in items if item.category == "dress")
    if has("jeans", "denim"):
        delta += 0.08 * sum(1 for item in items if "jean" in _blob(item) or "denim" in _blob(item))

    return max(-0.25, min(0.25, delta))


def _context_delta(
    items: Sequence[WardrobeItem],
    weather: str | None,
    time_of_day: str | None,
    dress_code: str | None,
    notes: str | None,
) -> float:
    """Translate structured occasion context into a score adjustment."""
    delta = 0.0
    blob = " ".join(_blob(item) for item in items)
    styles = {item.style for item in items}

    weather = (weather or "").strip().lower()
    if weather == "hot":
        delta -= 0.10 * sum(1 for word in HEAVY_FABRICS if word in blob)
        delta += 0.06 * sum(1 for word in LIGHT_FABRICS if word in blob)
    elif weather == "cold":
        delta += 0.08 * sum(1 for word in HEAVY_FABRICS if word in blob)
        if "shorts" in blob:
            delta -= 0.06
    elif weather == "rainy":
        delta += 0.06 * ("boot" in blob)
        delta -= 0.06 * ("sandal" in blob or "heel" in blob)
        delta += 0.05 * sum(1 for item in items if item.category == "outerwear")

    if time_of_day == "evening":
        delta += 0.06 * bool(styles & {"formal", "smartCasual"})
        delta -= 0.04 * bool(styles & {"sporty"})
    elif time_of_day == "day":
        delta += 0.04 * bool(styles & {"casual", "sporty"})

    dc = (dress_code or "").strip().lower().replace("_", "").replace("-", "")
    if dc == "casual":
        delta += 0.08 * ("casual" in styles)
        delta -= 0.08 * ("formal" in styles)
    elif dc in {"smartcasual", "business"}:
        delta += 0.08 * ("smartCasual" in styles)
        delta -= 0.08 * bool(styles & {"sporty", "streetwear"})
    elif dc == "formal":
        delta += 0.10 * ("formal" in styles)
        delta -= 0.10 * bool(styles & {"casual", "sporty", "streetwear"})

    if notes:
        delta += _feedback_delta(items, notes) * 0.5

    return max(-0.25, min(0.25, delta))


def _attach_optionals(
    core: list[WardrobeItem],
    grouped: dict[str, list[WardrobeItem]],
    venue: str,
    preferred_style: str | None,
) -> list[list[WardrobeItem]]:
    variants = [list(core)]
    core_ids = {item.id for item in core}

    def best_of(pool: list[WardrobeItem]) -> WardrobeItem | None:
        ranked: list[tuple[float, WardrobeItem]] = []
        for extra in pool:
            if extra.id in core_ids:
                continue
            trial = core + [extra]
            ranked.append(
                (
                    0.55 * venue_fit_score(trial, venue, preferred_style)
                    + 0.45 * cohesion_score(trial, preferred_style),
                    extra,
                )
            )
        if not ranked:
            return None
        ranked.sort(key=lambda pair: pair[0], reverse=True)
        return ranked[0][1]

    outer = best_of(grouped.get("outerwear") or [])
    shoes = best_of(grouped.get("shoes") or [])
    accessory = best_of(grouped.get("accessory") or [])

    if outer:
        variants.append(core + [outer])
    if shoes:
        variants.append(core + [shoes])
    if outer and shoes:
        variants.append(core + [outer, shoes])
    if accessory and len(variants[0]) >= 2:
        variants.append(core + ([outer] if outer else []) + [accessory])

    # Keep the core plus at most a couple of richer looks.
    unique: list[list[WardrobeItem]] = []
    seen: set[frozenset[str]] = set()
    for variant in variants:
        key = frozenset(item.id for item in variant)
        if key in seen:
            continue
        seen.add(key)
        unique.append(variant)
    return unique[:4]


def _inspiration_text(ref: dict | None) -> str | None:
    if not ref:
        return None
    if "searchTextObserved" in ref or "descriptionObserved" in ref:
        desc = str(ref.get("descriptionObserved") or "").strip()
        if desc:
            return desc[:240]
        return str(ref.get("searchTextObserved") or "").strip()[:240]
    category = str(ref.get("fashionDbCategory") or "").replace("_", " ")
    style = str(ref.get("style") or "")
    pieces: list[str] = []
    for piece in (ref.get("items") or [])[:4]:
        color = str(piece.get("color") or "")
        cat = str(piece.get("category") or "")
        if color or cat:
            pieces.append(f"{color} {cat}".strip())
    joined = " + ".join(pieces) if pieces else "a similar look"
    return f"{category} · {style}: {joined}".strip(" ·")


def _rationale_items(
    items: Sequence[WardrobeItem],
    venue: str,
    cohesion: float,
) -> list[RationaleItemOut]:
    labels = {
        "lecture": "lecture",
        "careerFair": "career fair",
        "casualDate": "casual date",
        "hallGathering": "hall gathering",
        "formal": "formal event",
    }
    venue_label = labels.get(venue, venue)
    out: list[RationaleItemOut] = []
    for item in items[:3]:
        color = (item.color or "").strip()
        cat = item.category
        if cat == "outerwear":
            reason = f"The {color} {cat} layers cleanly and lifts the whole look."
        elif cat == "shoes":
            reason = f"{color.capitalize()} {cat} ground the outfit for a {venue_label}."
        elif cat in {"top", "dress"}:
            if item.style in {"formal", "smartCasual"}:
                reason = f"The {color} {cat} reads polished enough for a {venue_label}."
            else:
                reason = f"The {color} {cat} keeps it comfortable and on-theme."
        elif cat == "bottom":
            reason = f"The {color} {cat} anchor the silhouette."
        elif cat == "accessory":
            reason = f"A small {color} {cat} ties the set together."
        else:
            reason = f"The {color} {cat} balances the look."
        if cohesion >= 0.75:
            reason += " The palette stays cohesive."
        out.append(RationaleItemOut(item_id=item.id, reason=reason))
    return out


def _to_outfit(candidate: Candidate, venue: str) -> OutfitOut:
    refs = [
        OutfitItemRef(
            id=item.id,
            category=item.category,
            color=item.color,
            description=item.description,
            image_url=item.image_url,
        )
        for item in candidate.items
    ]
    best_ref, _ = _best_reference(candidate.items, venue)
    return OutfitOut(
        id=str(uuid.uuid4()),
        items=refs,
        venue_fit_score=round(candidate.venue_fit, 4),
        cohesion_score=round(candidate.cohesion, 4),
        overall_score=round(candidate.overall, 4),
        rationale=candidate.rationale,
        rationale_items=_rationale_items(candidate.items, venue, candidate.cohesion),
        inspiration=_inspiration_text(best_ref),
        model_reference_url=fashion_index.model_reference_url(best_ref),
        try_on_url=None,
    )


def _select_diverse(ranked: list[Candidate], count: int) -> list[Candidate]:
    picked: list[Candidate] = []
    used: set[str] = set()
    for cand in ranked:
        if not cand.items:
            continue
        overlap = len(cand.item_ids & used) / max(len(cand.item_ids), 1)
        if picked and overlap >= 0.67:
            continue
        picked.append(cand)
        used |= cand.item_ids
        if len(picked) >= count:
            break
    if len(picked) < min(count, len(ranked)):
        for cand in ranked:
            if cand in picked:
                continue
            picked.append(cand)
            if len(picked) >= count:
                break
    return picked


def _apply_visual_styling(
    outfits: list[OutfitOut],
    candidates: list[Candidate],
    venue: str,
) -> None:
    """Re-read the top matched model images and append a styling note.

    Steps 5/6 of the pipeline: after text retrieval shortlists a model outfit,
    read its image to learn how the model actually styled it. Capped to
    settings.fashion_visual_rerank_max outfits; skips silently when images or
    the VLM key are unavailable.
    """
    max_count = max(0, min(int(settings.fashion_visual_rerank_max), len(outfits)))
    for index in range(max_count):
        outfit = outfits[index]
        candidate = candidates[index]
        best_ref, _ = _best_reference(candidate.items, venue)
        image_path = fashion_index.image_path_for(best_ref)
        if not image_path or not image_path.is_file():
            continue
        note = vlm.describe_styling_sync(
            image_path, venue, _outfit_text(candidate.items)
        )
        if note:
            prefix = outfit.inspiration or ""
            outfit.inspiration = f"{prefix} Model styling: {note}".strip()


def recommend_outfits(
    items: Sequence[WardrobeItem],
    venue: str,
    preferred_style: str | None = None,
    feedback: str | None = None,
    *,
    weather: str | None = None,
    time_of_day: str | None = None,
    dress_code: str | None = None,
    notes: str | None = None,
) -> tuple[list[OutfitOut], str | None]:
    wardrobe = list(items)
    warning: str | None = None
    if not wardrobe:
        return [], "Wardrobe is empty. Upload a few garments first."

    grouped = _by_category(wardrobe)
    has_core = (grouped["top"] and grouped["bottom"]) or grouped["dress"]
    if not has_core:
        warning = "Need a top+bottom or a dress for a complete look; returning the best available pieces."

    # Feedback changes the sample seed so refinement explores a fresh set of
    # combinations, not just a re-ranking of the previous candidates.
    seed_text = venue + str(len(wardrobe)) + (feedback or "")
    rng = random.Random(seed_text)
    cores = generate_cores(wardrobe, rng)
    candidates: list[Candidate] = []
    seen: set[frozenset[str]] = set()

    for core in cores:
        for combo in _attach_optionals(core, grouped, venue, preferred_style):
            key = frozenset(item.id for item in combo)
            if key in seen:
                continue
            seen.add(key)
            v_fit = venue_fit_score(combo, venue, preferred_style)
            coh = cohesion_score(combo, preferred_style)
            overall = 0.55 * v_fit + 0.45 * coh
            overall = min(1.0, overall + REFERENCE_BOOST * reference_similarity(combo, venue))
            overall = max(0.0, min(1.0, overall + _feedback_delta(combo, feedback)))
            overall = max(
                0.0,
                min(1.0, overall + _context_delta(combo, weather, time_of_day, dress_code, notes)),
            )
            candidates.append(
                Candidate(
                    items=combo,
                    venue_fit=v_fit,
                    cohesion=coh,
                    overall=overall,
                    rationale=_rationale(combo, venue, v_fit, coh),
                    warning=warning,
                )
            )

    if not candidates and wardrobe:
        combo = wardrobe[:4]
        v_fit = venue_fit_score(combo, venue, preferred_style)
        coh = cohesion_score(combo, preferred_style)
        overall = 0.55 * v_fit + 0.45 * coh
        candidates.append(
            Candidate(
                items=combo,
                venue_fit=v_fit,
                cohesion=coh,
                overall=overall,
                rationale=_rationale(combo, venue, v_fit, coh),
                warning=warning,
            )
        )

    candidates.sort(key=lambda c: c.overall, reverse=True)
    target = MAX_RETURN if len(candidates) >= MAX_RETURN else max(1, len(candidates))
    if target >= MIN_RETURN:
        target = min(MAX_RETURN, max(MIN_RETURN, target))
    selected = _select_diverse(candidates, target)
    outfits = [_to_outfit(c, venue) for c in selected]

    if settings.fashion_visual_rerank:
        _apply_visual_styling(outfits, selected, venue)

    if len(outfits) < MIN_RETURN:
        warning = warning or "Not enough distinct combinations yet — add more wardrobe items for 2–3 looks."
    return outfits, warning
