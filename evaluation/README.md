# USTyle Evaluation

Reproducible, objective evaluation of USTyle's core pipeline. This directory is
**separate from the app's real data** — experiments run against an isolated
backend instance (its own SQLite DB and uploads directory), so the user's real
wardrobe, profile, and saved looks are never touched.

## What is measured

1. **Upload screening/tagging** — acceptance/rejection rates, confusion matrix,
   category accuracy + macro-F1, color accuracy, formality MAE, end-to-end
   tagging success, and the heuristic accept-all baseline.
2. **Recommendation ablation** — full USTyle vs no-reference vs random-complete
   outfit, per fixed wardrobe and venue.
3. **Latency** — client wall-clock time for upload, recommend,
   upload-to-recommend, and try-on (median + p95).
4. **Functional reliability** — a pass/fail scenario matrix.

No human user study is performed. Any future LLM-judge scores are "judge
preference", never "user satisfaction".

## Directory layout

- `schemas/` — JSON schemas for labels, manifests, and raw results.
- `data/uploads/valid/` — single-garment images (one garment per photo).
- `data/uploads/negative/` — reject cases (model-worn outfits, multiple items,
  collages, irrelevant objects, unreadable images).
- `data/labels/upload_labels.csv` — ground-truth labels for every upload image.
- `data/wardrobes/*.json` — fixed wardrobe manifests for recommendation cases.
- `data/body_photos/` — consented body photos for try-on cases (gitignored).
- `scripts/` — pipeline scripts (see below).
- `results/raw/` — raw JSONL outputs (gitignored).
- `results/aggregated/` — computed metrics (committed, anonymized).
- `report/` — generated `REPORT.md` + `index.html` (committed deliverable).

## Prerequisites

- Backend dependencies installed (`backend/.venv`).
- `DEEPSEEK_API_KEY` and (for try-on) `KIE_API_KEY` present in the environment
  or `backend/.env`. Keys are never printed or committed.
- A tunneled public base URL (`PUBLIC_BASE_URL`) only if real kie.ai try-on is
  exercised; otherwise try-on falls back to PIL collage and is labeled as such.

## Quick start

```bash
# 1. Generate a tiny synthetic smoke set (pipeline check only — not real accuracy)
backend/.venv/bin/python evaluation/scripts/make_smoke_set.py

# 2. Start an isolated backend instance
backend/.venv/bin/python evaluation/scripts/run_server.py   # or see scripts/run_server.sh

# 3. Run the pipeline (in another terminal, same venv)
backend/.venv/bin/python evaluation/scripts/run_upload.py
backend/.venv/bin/python evaluation/scripts/run_recommend.py
backend/.venv/bin/python evaluation/scripts/run_latency.py
backend/.venv/bin/python evaluation/scripts/run_functional.py

# 4. Aggregate + report
backend/.venv/bin/python evaluation/scripts/analyze.py
backend/.venv/bin/python evaluation/scripts/report.py
```

Results appear in `results/aggregated/` and `report/`.

## Dataset conventions

Every image in `data/uploads/valid` and `data/uploads/negative` must have a row
in `data/labels/upload_labels.csv`:

| column | meaning |
| --- | --- |
| `case_id` | stable unique id, e.g. `u-001` |
| `filename` | path relative to `data/uploads/`, e.g. `valid/tee_blue.jpg` |
| `expected_class` | `valid_single`, `model_worn`, `multi_item`, `collage`, `irrelevant`, `unreadable` |
| `expected_category` | for valid rows: `top`, `bottom`, `outerwear`, `dress`, `shoes`, `accessory` |
| `expected_color` | canonical color name (see `COLOR_SYNONYMS` in `scripts/analyze.py`) |
| `expected_style` | `casual`, `smartCasual`, `streetwear`, `sporty`, `minimal`, `formal` |
| `expected_formality` | integer 0–100 |
| `expected_gender` | `male`, `female`, `unisex` |

Negative rows leave the attribute columns empty. Color/style labels may be
uncertain for subjective cases — note uncertainty in a trailing `notes` column.

## Reproducibility

Each run writes a manifest capturing the git revision, dependency versions, API
configuration presence (not secrets), reference-image counts, execution mode,
and hashes of `captions.jsonl`. Re-run any step and the outputs are idempotent
(keyed by `case_id`).
