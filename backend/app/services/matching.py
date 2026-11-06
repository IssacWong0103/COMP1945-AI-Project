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
from app.schemas import PREFERRED_STYLES, OutfitItemRef, OutfitOut

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


def reference_similarity(items: Sequence[WardrobeItem], venue: str) -> float:
    refs = load_reference_outfits()
    if not refs:
        return 0.0
    outfit_tokens = _outfit_tokens(items)
    if not outfit_tokens:
        return 0.0
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
        best = max(best, overlap * weight)
    return best


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


def _to_outfit(candidate: Candidate) -> OutfitOut:
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
    return OutfitOut(
        id=str(uuid.uuid4()),
        items=refs,
        venue_fit_score=round(candidate.venue_fit, 4),
        cohesion_score=round(candidate.cohesion, 4),
        overall_score=round(candidate.overall, 4),
        rationale=candidate.rationale,
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


def recommend_outfits(
    items: Sequence[WardrobeItem],
    venue: str,
    preferred_style: str | None = None,
) -> tuple[list[OutfitOut], str | None]:
    wardrobe = list(items)
    warning: str | None = None
    if not wardrobe:
        return [], "Wardrobe is empty. Upload a few garments first."

    grouped = _by_category(wardrobe)
    has_core = (grouped["top"] and grouped["bottom"]) or grouped["dress"]
    if not has_core:
        warning = "Need a top+bottom or a dress for a complete look; returning the best available pieces."

    rng = random.Random(venue + str(len(wardrobe)))
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
    outfits = [_to_outfit(c) for c in selected]

    if len(outfits) < MIN_RETURN:
        warning = warning or "Not enough distinct combinations yet — add more wardrobe items for 2–3 looks."
    return outfits, warning
