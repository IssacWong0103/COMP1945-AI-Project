# Outfit × Venue Matching Pipeline — Embedding Analysis vs. DeepSeek API

This document explains exactly how the Studio **outfit × venue recommendation** is computed, and separates the two independent mechanisms that run inside it:

1. **Local word-semantic analysis** (the "embedding" part) — token matching over a pre-captioned fashion database.
2. **The DeepSeek API call** — an optional visual-styling note added *after* the recommendation is already decided.

> **Key fact:** the recommendation (which outfits are chosen and how they are scored) is produced **entirely by the local semantic analysis**. The DeepSeek call contributes a single decorative sentence and does **not** change the selected outfits, their scores, or their ranking.

---

## 1. Pipeline overview

Entry point: `POST /api/recommend` → [`routes_recommend.py`](../backend/app/api/routes_recommend.py) → [`matching.recommend_outfits()`](../backend/app/services/matching.py).

```
recommend_outfits()
 ├─ validate wardrobe (top + bottom + shoes required)
 ├─ _generate_candidates()          # pure local scoring (heuristics + semantic similarity)
 │    └─ reference_similarity() ──► fashion_index.best_caption()   ◄── word-semantic analysis
 ├─ sort candidates
 ├─ _select_diverse()               # dedupe / diversify
 ├─ _to_outfit()                    # build response objects
 │    └─ _best_reference() ──────► fashion_index.best_caption()    ◄── word-semantic analysis
 │    └─ model_reference_url()      # copy the matched model photo locally
 └─ _apply_visual_styling()         # OPTIONAL — the only DeepSeek call
      └─ vlm.describe_styling_sync()                               ◄── DeepSeek API
```

---

## 2. Part A — The local word-semantic analysis (embeddings)

### 2.1 Where the code lives

- [`fashion_index.py`](../backend/app/services/fashion_index.py) — the retrieval module.
- [`matching.py`](../backend/app/services/matching.py) — the scoring/ranking module that consumes it.

### 2.2 Data source: `captions.jsonl`

The module loads `backend/app/data/captions.jsonl` (693 captions, produced by the **offline** captioning pipeline). Each caption describes one model outfit from the fashion database and carries structured garment fields.

```python
@lru_cache(maxsize=1)
def load_captions() -> list[dict]: ...
```

The file is loaded **once** and cached (`lru_cache`), so it never re-reads per request.

### 2.3 Step 1 — Tokenization

Two tokenizers turn text into lowercase word tokens:

| Function | Purpose |
|---|---|
| [`_tokens()`](../backend/app/services/fashion_index.py) | Split a text blob with `[a-z0-9]+`, drop length-1 tokens and stopwords. |
| [`_caption_tokens()`](../backend/app/services/fashion_index.py) | Build the token set for a caption: `searchTextObserved` + `descriptionObserved` + every garment's `category` (with `footwear` → `shoes` aliasing), `colours`, `pattern`, `cut`, `length`, `layering`. |

A caption's `fashionType` (2nd path segment of its image path, e.g. `casual`, `business_smart`) is mapped to allowed venues via [`FASHION_TYPE_VENUES`](../backend/app/services/fashion_index.py) and used as a venue-relevance weight.

### 2.4 Step 2 — Retrieval (`best_caption`)

The outfit's own text is built in [`_outfit_text()`](../backend/app/services/matching.py) — the space-joined `category color cut style description` of every chosen item — and passed into:

```
matching.reference_similarity()
  └─ matching._best_reference()
       └─ fashion_index.best_caption(query_text, venue)
            └─ fashion_index.top_captions(query_text, venue, k=1)
```

[`top_captions()`](../backend/app/services/fashion_index.py) has **two interchangeable similarity engines**:

**Mode 1 — TF-IDF + cosine similarity** (used when `scikit-learn` is installed):

- [`_tfidf_model()`](../backend/app/services/fashion_index.py) fits a `TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)` over the canonical text of all captions (cached once).
- The query is vectorized and scored with `cosine_similarity(query_vec, matrix)`.
- Each score is multiplied by the venue weight: `1.0` if the caption's fashion type is appropriate for the venue, else `0.55`.

**Mode 2 — Jaccard token overlap** (the automatic fallback, and what actually runs today because `scikit-learn` is not installed in the backend venv):

- [`_caption_index()`](../backend/app/services/fashion_index.py) builds an in-memory inverted index (`token → list of caption indices`), cached once.
- [`_jaccard_top()`](../backend/app/services/fashion_index.py) looks up the query tokens in the postings and scores each candidate with:

```
score = |query_tokens ∩ caption_tokens| / |query_tokens ∪ caption_tokens| × venue_weight
```

Both modes are **pure local computation over text** — no network, no LLM.

> Terminology note: this is "semantic similarity over words" (lexical / TF-IDF / Jaccard). It is *not* a neural embedding model (there is no `sentence-transformers` or similar in the repo). The phrase "embedding word semantic analysis" in this project refers to this module.

### 2.5 What the semantic analysis contributes to

The semantic similarity score is consumed in **three concrete places**:

| # | Function | Contribution |
|---|---|---|
| 1 | [`_generate_candidates()`](../backend/app/services/matching.py) → [`reference_similarity()`](../backend/app/services/matching.py) | Adds `REFERENCE_BOOST (0.08) × similarity` to each candidate's `overall` score. This **re-ranks** candidates in favour of outfits that resemble a real fashion-DB look. |
| 2 | [`_to_outfit()`](../backend/app/services/matching.py) → [`_best_reference()`](../backend/app/services/matching.py) | Selects the single best-matching caption and uses it to fill the `inspiration` field via [`_inspiration_text()`](../backend/app/services/matching.py). |
| 3 | [`_to_outfit()`](../backend/app/services/matching.py) → [`model_reference_url()`](../backend/app/services/fashion_index.py) | Resolves the matched caption's model photo to a local path and copies it into `/uploads/reference/`, producing the `modelReferenceUrl` shown to the user. |

So the semantic analysis influences **ranking, the inspiration text, and the reference image** — but never itself performs any LLM call.

---

## 3. Part B — The DeepSeek API call

### 3.1 Where the code lives

- [`vlm.py`](../backend/app/services/vlm.py) — DeepSeek client.
- [`matching.py`](../backend/app/services/matching.py) → [`_apply_visual_styling()`](../backend/app/services/matching.py).

### 3.2 The exact call

The recommend path makes **one** DeepSeek call, inside [`describe_styling_sync()`](../backend/app/services/vlm.py):

| Aspect | Value |
|---|---|
| Endpoint | `https://api.deepseek.com/chat/completions` |
| Model | `deepseek-flash` |
| Prompt (system) | [`STYLING_SYSTEM_PROMPT`](../backend/app/services/vlm.py) — "describe HOW the outfit is styled: layering, tucks, cuffs, socks, accessories, proportions… 1–2 short factual sentences" |
| Prompt (user) | `Venue: {venue}. User's outfit pieces: {outfit_text}. Describe how the model styled this look.` |
| Image | The matched fashion-DB model photo, base64-encoded as a `data:` URL |
| Timeout | 45 seconds, blocking |

```python
def describe_styling_sync(image_path: Path, venue: str, context: str) -> str | None:
    ...
    body = {
        "model": DEEPSEEK_MODEL,          # deepseek-flash
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": STYLING_SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": user_text},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]},
        ],
    }
    response = httpx.post(DEEPSEEK_URL, headers=headers, json=body, timeout=45.0)
    ...
    return note[:300] or None
```

### 3.3 Where it is triggered

[`recommend_outfits()`](../backend/app/services/matching.py) calls it only when **both** conditions hold:

```python
if settings.fashion_visual_rerank and use_reference:
    _apply_visual_styling(outfits, selected, venue)
```

[`_apply_visual_styling()`](../backend/app/services/matching.py) then processes only the top `settings.fashion_visual_rerank_max` outfits (default `1`).

Relevant settings in [`config.py`](../backend/app/config.py):

```python
deepseek_api_key: str = ""
fashion_visual_rerank: bool = True      # default ON
fashion_visual_rerank_max: int = 1      # top 1 outfit only
```

Because the Studio frontend never sends `useReference`, [`RecommendRequest.use_reference`](../backend/app/schemas.py) defaults to `True`, so the call fires on every Studio run while the defaults stay `True`.

### 3.4 What the DeepSeek call contributes to

Its **only** effect is one decorative sentence:

```python
outfit.inspiration = f"{prefix} Model styling: {note}".strip()
```

i.e. it appends `"Model styling: …"` to the **already-final** `inspiration` text of the top outfit. It does **not**:

- change which outfits are selected,
- change `venueFitScore`, `cohesionScore`, `overallScore`, or `formalityScore`,
- re-order the results,
- affect `rationale` / `rationaleItems`,
- affect the model reference image.

### 3.5 Other DeepSeek usages (not part of matching)

For completeness, [`vlm.py`](../backend/app/services/vlm.py) also calls DeepSeek in these **separate, non-recommend** flows:

| Function | Used by | Purpose |
|---|---|---|
| `describe_garment()` | wardrobe upload | Screen + tag an uploaded garment photo (category/color/style/formality). |
| `verify_full_body_photo()` | profile | Check a body photo is full-body with visible face. |
| `analyze_profile_photo()` | profile | Infer gender + skin tone. |
| `describe_styling_sync()` | **recommend** | The one discussed above. |

None of these are involved in the outfit × venue *matching* calculation.

---

## 4. Latency comparison

Measured from the repo's own evaluation artifacts and a local benchmark:

| Mode | Time |
|---|---|
| Full pipeline with DeepSeek styling (`use_reference=true`, `fashion_visual_rerank=true`) | **3.4 – 7.6 s** per run |
| Semantic analysis only (`use_reference=false`) | **9 – 14 ms** |
| Semantic + reference image, DeepSeek off (`fashion_visual_rerank=false`) | **median 8 – 153 ms** |

The DeepSeek call is therefore ~100% of the slowdown. The semantic pipeline runs in tens of milliseconds, well under one second.

### How to run without DeepSeek

Set in `backend/.env`:

```env
FASHION_VISUAL_RERANK=false
```

or

```env
FASHION_VISUAL_RERANK_MAX=0
```

This keeps the entire word-semantic ranking + reference-image flow intact and only removes the "Model styling" note.

---

## 5. Function-by-function reference

### Semantic analysis

| Function | File | Role |
|---|---|---|
| [`load_captions()`](../backend/app/services/fashion_index.py) | fashion_index.py | Load + cache `captions.jsonl`. |
| [`_tokens()`](../backend/app/services/fashion_index.py) | fashion_index.py | Tokenize text. |
| [`_caption_tokens()`](../backend/app/services/fashion_index.py) | fashion_index.py | Build a caption's token set from text + garment fields. |
| [`_caption_index()`](../backend/app/services/fashion_index.py) | fashion_index.py | Build cached inverted index (`token → caption ids`). |
| [`_tfidf_model()`](../backend/app/services/fashion_index.py) | fashion_index.py | Fit cached TF-IDF vectorizer over captions (sklearn mode). |
| [`_jaccard_top()`](../backend/app/services/fashion_index.py) | fashion_index.py | Jaccard overlap retrieval (fallback / current mode). |
| [`top_captions()`](../backend/app/services/fashion_index.py) | fashion_index.py | Rank captions for a query + venue. |
| [`best_caption()`](../backend/app/services/fashion_index.py) | fashion_index.py | Return the single best caption + score. |
| [`model_reference_url()`](../backend/app/services/fashion_index.py) | fashion_index.py | Copy matched model photo into uploads. |
| [`_outfit_text()`](../backend/app/services/matching.py) | matching.py | Serialize outfit items into a query string. |
| [`reference_similarity()`](../backend/app/services/matching.py) | matching.py | Similarity score → overall-score boost. |
| [`_best_reference()`](../backend/app/services/matching.py) | matching.py | Best caption, with fallback to `reference_outfits.json`. |

### DeepSeek / visual styling

| Function | File | Role |
|---|---|---|
| [`describe_styling_sync()`](../backend/app/services/vlm.py) | vlm.py | Blocking DeepSeek vision call; returns a short styling note. |
| [`STYLING_SYSTEM_PROMPT`](../backend/app/services/vlm.py) | vlm.py | System prompt asking only for styling-technique sentences. |
| [`_apply_visual_styling()`](../backend/app/services/matching.py) | matching.py | Calls the VLM for the top outfits and appends the note to `inspiration`. |
| `fashion_visual_rerank` / `fashion_visual_rerank_max` | config.py | Feature flags gating the DeepSeek call. |

---

## 6. Summary

- The **outfit × venue recommendation** is computed by the **local word-semantic module** (`fashion_index.py`): tokenization + TF-IDF/cosine (or Jaccard fallback) over 693 pre-captioned model outfits, plus local heuristics for venue fit, cohesion, and formality.
- The **DeepSeek API** in the matching path is a single, optional, blocking call (`describe_styling_sync`) that only appends a "Model styling:" sentence to the top outfit's `inspiration` field.
- Turning off `FASHION_VISUAL_RERANK` removes DeepSeek entirely and restores sub-second, purely semantic recommendations with **no change to outfit selection or scoring**.
