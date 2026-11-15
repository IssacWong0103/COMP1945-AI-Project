# USTyle — Structured Quality Rubric

This rubric is the answer key for the **structured expert review** part of the
evaluation. It is applied to two things the system cannot score on its own:
outfit quality and virtual try-on visual quality.

**Important honesty note:** the ratings are produced by an **independent AI
judge** (DeepSeek Flash), blind to the system's own scores and in shuffled
order. These are **judge-preference scores**, not human feedback, and not a
user study. If teammates rate the same items later, record that separately.

## Scale (both rubrics)

| Score | Meaning |
| ---: | --- |
| 1 | Clearly wrong / broken |
| 2 | Mostly wrong with one saving grace |
| 3 | Acceptable but with visible issues |
| 4 | Good, minor nits only |
| 5 | Excellent, no meaningful issues |

## A. Outfit quality — 1–5 on each question

1. **Venue appropriate** — does the outfit fit the requested venue (lecture,
   career fair, casual date…)?
2. **Visually cohesive** — do the colours and styles of the items go together?
3. **Complete** — is it a full outfit (top + bottom, plus outerwear/shoes where
   the venue needs them), not a shirt with no bottoms?
4. **Practical** — could an HKUST student realistically wear it?

## B. Try-on visual quality — 1–5 on each question

Given the user's own full-body photo and the list of requested garments:

1. **Same person?** — is the subject's identity preserved?
2. **Natural proportions?** — is the body stretched, shrunk, or distorted?
3. **Photorealistic?** — does it look like a photo, not a cartoon or render?
4. **No artifacts?** — extra limbs, smears, melted fabric, text glitches?
5. **Garments kept?** — right category and colour per requested item, nothing
   missing or replaced?

## How the ratings are produced

- `evaluation/scripts/run_quality_rating.py` reads the live backend DB for
  outfits that have a generated try-on, builds blind prompts (venue + garment
  list only — no system scores), shuffles the order with a fixed seed, and asks
  DeepSeek Flash to score each item.
- Raw scores land in `evaluation/results/raw/quality_ratings.csv`; means per
  question land in `evaluation/results/aggregated/quality_metrics.json`, which
  the report generator renders as the "Structured quality review" section.
