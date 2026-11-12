"""Text-first retrieval over the pre-captioned fashion database.

Loads captions.jsonl (produced by the offline captioning pipeline) once and
matches an outfit's text tokens against each caption's searchable wording plus
its structured garment fields. Caption `footwear` is mapped to the app's
`shoes` vocabulary so cross-vocabulary matches still work.

When captions.jsonl is missing, callers fall back to reference_outfits.json in
matching.py.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# fashionType (the second path segment of exportPath: sex/fashionType/<file>)
# mapped to the venues where that style is appropriate.
FASHION_TYPE_VENUES: dict[str, set[str]] = {
    "casual": {"lecture", "casualDate", "hallGathering"},
    "business_smart": {"careerFair", "lecture", "formal"},
    "formal": {"formal", "careerFair"},
    "athletic_sport": {"hallGathering", "lecture"},
    "loungewear": {"hallGathering", "lecture"},
    "streetwear": {"casualDate", "hallGathering"},
}

# The caption schema calls footwear "footwear"; the app calls it "shoes".
FOOTWEAR_ALIASES = {"footwear", "shoes", "shoe", "sneaker", "sneakers", "boots", "heels"}

_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "in", "on", "with", "for", "to",
    "is", "are", "was", "be", "at", "by", "as", "it", "its", "this",
    "that", "these", "those", "not", "no",
}


def _tokens(*parts: str) -> set[str]:
    blob = " ".join(p for p in parts if p).lower()
    return {
        tok
        for tok in re.findall(r"[a-z0-9]+", blob)
        if len(tok) > 1 and tok not in _STOPWORDS
    }


def _caption_tokens(caption: dict) -> set[str]:
    parts = [
        str(caption.get("searchTextObserved") or ""),
        str(caption.get("descriptionObserved") or ""),
    ]
    for garment in caption.get("garments") or []:
        if not isinstance(garment, dict):
            continue
        cat = str(garment.get("category") or "").lower()
        if cat:
            parts.append(cat)
            if cat in FOOTWEAR_ALIASES and cat != "shoes":
                parts.append("shoes")
        colours = garment.get("colours")
        if isinstance(colours, list):
            parts.extend(str(c) for c in colours if c)
        for field in ("pattern", "cut", "length", "layering"):
            value = garment.get(field)
            if value:
                parts.append(str(value))
    return _tokens(*parts)


def fashion_type_of(caption: dict) -> str:
    segments = [s for s in str(caption.get("relativeImagePath") or "").split("/") if s]
    return segments[1].lower() if len(segments) >= 2 else ""


def image_path_for(caption: dict | None) -> Path | None:
    """Resolve a caption's model image to a local path via the configured root."""
    if not caption:
        return None
    root = settings.fashion_images_root_dir
    relative = str(caption.get("relativeImagePath") or "").strip()
    if not root or not relative:
        return None
    return root / relative


@lru_cache(maxsize=1)
def load_captions() -> list[dict]:
    path = settings.fashion_captions_file
    if not path.is_file():
        logger.warning(
            "captions.jsonl missing at %s; falling back to reference_outfits.json",
            path,
        )
        return []
    try:
        with path.open("r", encoding="utf-8") as fh:
            captions = [json.loads(line) for line in fh if line.strip()]
    except (json.JSONDecodeError, OSError):
        logger.exception("Failed to parse captions at %s", path)
        return []
    return [
        c
        for c in captions
        if isinstance(c, dict) and c.get("assetId") and c.get("relativeImagePath")
    ]


@lru_cache(maxsize=1)
def _caption_index() -> tuple[dict[str, list[int]], list[tuple[set[str], str, dict]]]:
    """Return (term -> caption indices, entries) for fast candidate lookup."""
    entries: list[tuple[set[str], str, dict]] = []
    postings: dict[str, set[int]] = {}
    for caption in load_captions():
        tokens = _caption_tokens(caption)
        if not tokens:
            continue
        index = len(entries)
        entries.append((tokens, fashion_type_of(caption), caption))
        for token in tokens:
            postings.setdefault(token, set()).add(index)
    return {token: list(ids) for token, ids in postings.items()}, entries


def caption_text(caption: dict) -> str:
    """Canonical searchable text for a caption (for vectorization/queries)."""
    parts = [
        str(caption.get("searchTextObserved") or ""),
        str(caption.get("descriptionObserved") or ""),
    ]
    for garment in caption.get("garments") or []:
        if not isinstance(garment, dict):
            continue
        cat = str(garment.get("category") or "").lower()
        if cat:
            parts.append(cat)
            if cat in FOOTWEAR_ALIASES and cat != "shoes":
                parts.append("shoes")
        colours = garment.get("colours")
        if isinstance(colours, list):
            parts.extend(str(c) for c in colours if c)
        for field in ("pattern", "cut", "length", "layering"):
            value = garment.get(field)
            if value:
                parts.append(str(value))
    return " ".join(part for part in parts if part)


@lru_cache(maxsize=1)
def _tfidf_model():
    """Fit a TF-IDF vectorizer over all captions once (cached)."""
    from sklearn.feature_extraction.text import TfidfVectorizer

    captions = load_captions()
    texts = [caption_text(c) for c in captions]
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
    matrix = vectorizer.fit_transform(texts)
    return vectorizer, matrix


def _jaccard_top(query_text: str, venue: str, k: int) -> list[tuple[dict, float]]:
    query_tokens = _tokens(query_text)
    if not query_tokens:
        return []
    postings, entries = _caption_index()
    candidates: set[int] = set()
    for token in query_tokens:
        candidates.update(postings.get(token, ()))
    scored: list[tuple[dict, float]] = []
    for index in candidates:
        tokens, fashion_type, caption = entries[index]
        allowed = FASHION_TYPE_VENUES.get(fashion_type, set())
        weight = 1.0 if (not allowed or venue in allowed) else 0.55
        overlap = len(query_tokens & tokens) / len(query_tokens | tokens)
        scored.append((caption, overlap * weight))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:k]


def top_captions(query_text: str, venue: str, k: int = 1) -> list[tuple[dict, float]]:
    """Return the k best-matching captions for a text query and venue."""
    captions = load_captions()
    if not captions or not (query_text or "").strip():
        return []
    try:
        from sklearn.metrics.pairwise import cosine_similarity

        vectorizer, matrix = _tfidf_model()
        query_vec = vectorizer.transform([query_text])
        sims = cosine_similarity(query_vec, matrix).ravel()
    except Exception:  # noqa: BLE001
        return _jaccard_top(query_text, venue, k)

    scored: list[tuple[dict, float]] = []
    for index, caption in enumerate(captions):
        fashion_type = fashion_type_of(caption)
        allowed = FASHION_TYPE_VENUES.get(fashion_type, set())
        weight = 1.0 if (not allowed or venue in allowed) else 0.55
        scored.append((caption, float(sims[index]) * weight))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    if not scored or scored[0][1] <= 0:
        return []
    return scored[:k]


def best_caption(query_text: str, venue: str) -> tuple[dict | None, float]:
    """Return (best caption, similarity score) for a text query and venue."""
    top = top_captions(query_text, venue, k=1)
    if not top:
        return None, 0.0
    return top[0]
