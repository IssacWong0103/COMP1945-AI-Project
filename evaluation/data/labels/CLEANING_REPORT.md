# dataset_set3 — Cleaning Report

Cleaned: 2026-11-18 · Source: `dataset_set3/` (untouched originals, except `.DS_Store` removal) · Output: `dataset_set3/cleaned/`

## What was done

1. **Integrity check** — all 160 source images opened and verified with PIL: no corrupt files, no zero-byte files, no extension/format mismatches, no suspiciously tiny images.
2. **Exact-duplicate check (MD5)** — none.
3. **Near-duplicate check (perceptual hash, all 160 images)** — 6 candidate pairs reviewed visually. One true duplicate found and removed:
   - `rejected/multi_item/080.jpg` = identical photo of a clothing rack as `077.jpg` → **removed** (077 kept). All other pairs were different products (two green caps, two brown belts, two white jackets, etc.) and were kept.
4. **`.DS_Store` files** — removed.
5. **Categorized the 61 "more clothes but not yet categorized" images** — each was visually reviewed and assigned to a category. All 61 show a single garment and belong in `valid`. Note: `P43.jpg` and `P43.png` are *different* photos (pink sneakers vs navy running shoes) despite the shared number.
6. **Restructured + renamed** to the layout the evaluation plan expects:
   - `cleaned/valid/<category>/<category>-NNN.jpg`
   - `cleaned/negative/<class>/<class>-NNN.jpg`
7. **Manifest** — `upload_labels.csv` (159 rows) with the exact schema from the evaluation plan: `case_id, filename, expected_class, expected_category, expected_color, expected_style, expected_formality, expected_gender, notes`.
   - `expected_color / style / formality / gender` are **left blank deliberately** — per the plan, these must be filled by the independent LLM judge, not pre-baked.
   - `notes` carries a short visual description for the 61 newly categorized images, plus borderline flags.

## Final counts (159 images)

| Group | Class / category | Count | Plan target |
| --- | --- | ---: | ---: |
| valid | top | 20 | 10 |
| valid | bottom | 20 | 10 |
| valid | outerwear | 20 | 10 |
| valid | dress | 19 | 10 |
| valid | shoes | 21 | 10 |
| valid | accessory | 20 | 10 |
| **valid total** | | **120** | 60 |
| negative | model_worn | 12 | 12 |
| negative | multi_item | 11 | 12 (was 12; 1 duplicate removed) |
| negative | collage | 6 | 6 |
| negative | irrelevant | 5 | 5 |
| negative | unreadable | 5 | 5 |
| **negative total** | | **39** | 40 |

The valid set is ~2× the plan's 60 — the evaluating agent can subsample 10 per category for the 100-image benchmark and keep the rest as extra/dev data.

## Issues the evaluating agent should know

1. **`multi_item` has 11, not 12** — one duplicate was removed. Source one more multi-item photo if the plan's n=12 is strict.
2. **3 borderline valid images** (flagged in `notes`):
   - `valid/outerwear/outerwear-019.jpg` — leather jacket on hanger, other garments visible in closet background.
   - `valid/shoes/shoes-018.jpg` — a hand is visible holding the sandal.
   - `valid/accessory/accessory-014.jpg` — red cap photographed on folded jeans; may trigger a `multi_item` false-reject. Decide whether to keep it as a hard valid case or move it to negatives.
3. **`dress` ends at 19** (source folder was missing `034.jpg`) — still well above the plan's 10.
4. The 59 pre-categorized images were trusted from their source folders and were not individually re-labelled; the 61 additions were categorized by an agent during cleaning — treat the LLM-judge pass as the authoritative label check for both.
5. `expected_color/style/formality/gender` are intentionally blank for the independent LLM-judge labelling pass (two judges + adjudication per the plan).
