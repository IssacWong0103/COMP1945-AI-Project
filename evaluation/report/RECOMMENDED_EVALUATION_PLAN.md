# USTyle — Recommended Evaluation Plan

> **Purpose.** This document describes what a *proper, realistic, and persuasive*
> evaluation of USTyle would look like. It is written in response to the honest
> observation that the current evaluation (`REPORT.md` / `INTERPRETATION.md`) is
> **directional but not yet generalisable**, because the test set is small
> (20 upload photos, 1 wardrobe × 3 venues, try-on lightly measured).
>
> This is a **design document, not a new run**. It specifies (1) the dataset we
> *should* build, (2) the procedure we *should* follow, and (3) the statistical
> standards that would make the results convincing to a course marker or an
> external reviewer. **All labelling and quality judgements are LLM-as-a-judge
> (no human raters, no user study)** — we accept the known limitations of that
> choice for time reasons and label the evidence accordingly.

---

## 1. What the current evaluation proves — and what it does not

A sound evaluation starts by separating **claims we can already support** from
**claims we are not yet entitled to make**.

| Claim about USTyle | Current evidence | Status |
| --- | --- | --- |
| The upload screen never wrongly rejects a real garment | 10/10 valid accepted | ✅ supported, but **n = 10** is weak |
| The screen rejects most trick photos | 9/10 rejected | ⚠️ one known gap; **1 sample per failure mode** |
| Tags are accurate (category/style/colour/formality) | 100 % / 100 % / 80 % / MAE 3.9 on 10 items | ⚠️ promising, **n = 10**, no judge agreement measured |
| Recommendation beats chance | +0.158 vs random on 3 cases | ⚠️ pilot only; **n = 3**, self-scored |
| The retailer reference adds value | +0.004 vs no-reference | ⚠️ **under-powered**; 3 cases cannot detect a small effect |
| Latency meets the ≤20 s demo target | 30 reps, all ≤20 s | ✅ supported for this machine/time |
| Core user flows behave correctly | 9/10 pass, 1 fail | ✅ mostly supported; scenario coverage thin |
| Try-on looks realistic and faithful | 6 AI-judge ratings, mean 4.5/5 | ⚠️ AI judge only, n = 6 |
| Outfits are venue-appropriate and stylish | AI judge 3.17/5 | ⚠️ **weakest evidence** — needs more cases and a second LLM judge |
| Usability / user satisfaction | none | ⚪ **out of scope** — no human study (time constraint) |

**The core problem is not the metrics — it is the sample.** Every percentage in
the current report has a confidence interval too wide to be persuasive (see
§4.1). A proper evaluation fixes the *sample design* first, then the *procedure*.

---

## 2. Guiding principles for a sound evaluation

1. **Pre-register the research questions and success thresholds** before running
   anything. This prevents "moving the goalposts" after seeing results.
2. **Held-out, representative test data.** No image or wardrobe used to develop
   prompts, thresholds, or matching rules may appear in the test set.
3. **Independent ground truth.** Ground truth comes from **LLM-as-a-judge**
   (one or more independent models, e.g. DeepSeek Flash plus a second model),
   clearly labelled as AI-judge output — never from USTyle grading itself. This
   is a deliberate time trade-off; the limitation is stated, not hidden.
4. **Sample sizes chosen by statistical power**, with confidence intervals
   reported for every proportion and mean.
5. **Randomisation and blinding** wherever preference/quality is judged.
6. **Reproducibility.** Pinned git revision, pinned dependency versions, fixed
   random seeds, isolated backend instance, committed raw outputs.
7. **Separate "objective" from "subjective" evidence.** Accept/reject, tags,
   latency, and functional flows are *objective*; outfit quality and try-on
   realism are *preference/quality* evidence and are measured with LLM-as-a-judge
   rubrics, reported with judge agreement rather than human agreement.

---

## 3. Research questions, metrics, and success thresholds

Every dataset and procedure below exists to answer one of these questions.

| # | Research question | Primary metric(s) | Proposed threshold |
| --- | --- | --- | --- |
| RQ1 | Does screening accept valid garments and reject invalid ones? | Per-class recall/precision, macro-F1, false-acceptance rate per negative class, end-to-end tagging success | Valid recall ≥ 0.95; per-negative-class rejection ≥ 0.90 |
| RQ2 | Are tags accurate? | Category / colour / style accuracy; formality MAE and weighted kappa | Category & style ≥ 0.85; colour ≥ 0.80; formality MAE ≤ 10 |
| RQ3 | Are recommendations better than baselines and acceptable to a blind LLM judge? | Pairwise win rate vs baselines; blind LLM-judge venue-fit/cohesion ≥ 4/5 rate | Win rate > 0.5 with 95 % CI excluding 0.5; median judge score ≥ 3.5/5 |
| RQ4 | Does the retailer reference add measurable value? | Win rate and mean-difference vs no-reference; effect size (Cliff's δ) | Effect size and CI reported; decision made on the interval, not a point estimate |
| RQ5 | Is latency acceptable in real use? | p50 / p95 / p99, success rate | p95 ≤ 20 s; success rate ≥ 0.95 |
| RQ6 | Is try-on realistic and faithful? | Rubric means (1–5) from ≥ 2 LLM judges; judge-model agreement | Mean ≥ 3.5/5 per question with reported judge agreement |
| RQ7 | ~~Is the app usable by the target user?~~ | — (out of scope: no human study) | — |
| RQ8 | Do core and edge-case flows behave correctly? | Functional pass rate on expanded matrix | ≥ 0.90, with every failure triaged |

---

## 4. The test dataset — what "enough" looks like

### 4.1 Upload screening & tagging dataset

The current 20-photo set is a **smoke set**, not a benchmark. To make a
persuasive claim about screening accuracy, the dataset must be:

1. **Large enough for a meaningful confidence interval.** The table below shows
   the 95 % Wilson half-width for an observed proportion `p` at different sample
   sizes `n`:

| n | p = 0.90 | p = 0.95 |
| ---: | ---: | ---: |
| 20 | ± 0.137 | ± 0.114 |
| 50 | ± 0.085 | ± 0.066 |
| 100 | ± 0.060 | ± 0.045 |
| 200 | ± 0.042 | ± 0.031 |
| 400 | ± 0.030 | ± 0.022 |

   **Recommendation: n = 100 photos total** (≈ 60 valid + 40 negative). This is
   the agreed scope: large enough to report a 0.90 proportion with a ± 0.06
   half-width (and ± 0.045 at 0.95), while remaining buildable in the available
   time. Per-class counts stay small, so the report must say "pilot with stated
   uncertainty", not "benchmark".

2. **Stratified across the attributes the system actually labels** (these match
   the existing [upload_label.json](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/schemas/upload_label.json) schema):

   | Dimension | Strata |
   | --- | --- |
   | Category (valid) | top, bottom, outerwear, dress, shoes, accessory — aim ≈ 10 per category (60 valid total) |
   | Colour | black, white, gray, blue, navy, brown/beige, red, green, and ≥ 2 hard near-synonym pairs (e.g. gray vs light gray) |
   | Style | casual, smartCasual, streetwear, sporty, minimal, formal — spread across styles; note imbalance in the report |
   | Formality | low (0–33), mid (34–66), high (67–100) bands — balanced |
   | Gender fit | male, female, unisex |
   | Photo condition | flat-lay, on hanger, mannequin, single worn garment, varied lighting/backgrounds |

3. **Realistic negative classes with enough cases per failure mode.** One
   multi-item photo cannot characterise the gap it revealed:

   | Negative class | What it exercises | Suggested n |
   | --- | --- | ---: |
   | `model_worn` | person wearing a full outfit | 12 |
   | `multi_item` | ≥ 2 garments laid out / hanging together | 12 |
   | `collage` | split/montage images | 6 |
   | `irrelevant` | non-clothing objects (car, cat, food…) | 5 |
   | `unreadable` | blurry, extreme low-light, occluded | 5 |

   The `multi_item` class should be **oversampled** because it is the one known
   systematic failure.

4. **Source realism.** The current set appears to be curated e-commerce-style
   photos. A persuasive set mixes:
   - real **target-user photos** (phone camera, dorm lighting, hangers, beds),
   - e-commerce product shots (flat-lay and mannequin),
   - lifestyle photos (person wearing one clearly isolatable garment).

5. **Labelling protocol (LLM-as-a-judge).** Each image is labelled by an
   **independent LLM judge** (DeepSeek Flash or another model) for
   `expected_class` and, for valid images, category/colour/style/formality/
   gender. A **second LLM judge** (a different model or a temperature-varied
   re-run) labels the same items; disagreements go to a **third LLM pass** as
   adjudicator. Report **judge agreement**:
   - agreement / Krippendorff's α for the class label,
   - Cohen's κ for category/style,
   - weighted κ for formality bands.
   Aim for agreement ≥ 0.8 before the set is used. Colour/style uncertainty is
   recorded in the `notes` column (the current CSV already supports this).

6. **Train/dev/test separation.** Keep a small **dev set** (for tuning prompts
   and rules) strictly separate from the **held-out test set** used in the
   final run. The 20 current photos can be re-purposed as dev data, not final
   evidence.

### 4.2 Recommendation dataset

The current 1-wardrobe × 3-venue pilot cannot distinguish the reference feature
from the core rules. A sound recommendation evaluation needs **wardrobe
diversity × venue coverage × baselines × independent judgment**.

| Component | Current | Recommended |
| --- | --- | --- |
| Wardrobes | 1 (10 items) | **10–20 manifests** |
| Venues | 3 of 5 | **all 5** (`lecture`, `careerFair`, `casualDate`, `hallGathering`, `formal`) |
| Cases | 3 | **50–100 base cases** (wardrobe × venue) |
| Context variants | none | weather, timeOfDay, dressCode, feedback on a subset |
| Baselines | random | random + colour-matching heuristic + no-reference |
| Ground truth | system's own score | **blind LLM-judge ratings + "acceptable outfit" sets** |

**Wardrobe manifests should cover the realistic spectrum** (see
[wardrobe_manifest.json](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/schemas/wardrobe_manifest.json)):

- complete casual closet (top/bottom/shoes + outerwear),
- complete smart/formal closet,
- minimal closet (top-only, bottom-only, missing shoes),
- large closet (≥ 30 items with near-duplicate colours — a hard case),
- seasonal closet (winter coats only),
- clashing-colour closet (deliberately hard cohesion cases),
- female and unisex closets (current data is male-skewed).

**Two complementary measures for each case:**

1. **Objective constraint checks** — completeness, no duplicate items, no
   invalid combinations, non-empty return (the harness already records
   `constraint_checks`).
2. **Preference quality** — a blind LLM judge (two independent judges where
   possible) rates the top outfit on the existing 1–5 rubric (venue appropriate,
   cohesive, complete, practical). *Do not rely on the system's own
   `overall_score` as the primary outcome.*

**Ground-truth "acceptable outfit" sets.** For a subset of cases (e.g. 20), the
LLM judge lists which outfit combinations are acceptable. This enables
precision@k / recall of acceptable items rather than only a self-computed score.

### 4.3 Try-on dataset

We already have a **few consented body photos** (at least one already uploaded
to the system), so try-on can be measured rather than skipped. A proper try-on
evaluation:

- uses the **consented body photos we have** — no new human recruitment needed;
- runs **5–10 outfits per body photo** (as many generated images as time
  allows);
- rates the existing 5-question rubric (same person, proportions, realism,
  artifacts, garments kept) with **≥ 2 independent LLM judges**;
- reports **judge-model agreement** (pairwise agreement / ICC across judges) —
  a mean of 4.5 is persuasive only if judges actually agree;
- adds a **garment-fidelity check** (does the output show the requested items?)
  as a separate pass/fail metric, since the current run flagged one
  wrong-garment case.

### 4.4 Latency

The current 30-rep run is fine for a single machine, but a persuasive number
should:

- run **30–50 repetitions** across **≥ 2 sessions / times of day** (to capture
  API and network variance);
- report **p50, p95, p99, and success rate** (not just median);
- record whether each rep used **real VLM / kie.ai** or a fallback path, and
  separate the two.

### 4.5 Functional reliability

Expand the 10-scenario matrix to **15–20 scenarios** covering:

- every negative upload class (model_worn, multi_item, collage, irrelevant,
  unreadable);
- every venue (including `formal` with insufficient formal items → graceful
  fallback);
- try-on with/without body photo, with/without API key, with only 1 usable
  image;
- save/restore, empty closet, incomplete closet, offline/connection error;
- duplicate upload and re-tagging.

### 4.6 Usability / user study — out of scope

By decision, **no human user study or human judges** are used (time
constraint). Usability evidence is therefore limited to the **scenario
walkthrough and demo script** in [DEMO_SCRIPT.md](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/report/DEMO_SCRIPT.md)
and the functional reliability matrix (§4.5). The report will state this
explicitly rather than implying user satisfaction.

---

## 5. Procedure — how to run a sound evaluation

### Phase 0 — Protocol and pre-registration (1 session)

1. Write down RQ1–RQ8 with the thresholds above.
2. Decide the analysis plan (§6) **before** collecting data.
3. Pin the git revision and dependency versions in a manifest (the harness
   already writes one — keep it).

### Phase 1 — Build and label the dataset (the bulk of the work)

1. **Collect** upload images per the stratification in §4.1 (use the
   image-search prompt in the appendix).
2. **Two LLM judges label independently** using the existing
   [upload_labels.csv](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/data/labels/upload_labels.csv)
   schema; a third LLM pass adjudicates disagreements.
3. Compute judge agreement; if < 0.8, refine the labelling prompt and re-label.
4. Build **wardrobe manifests** per §4.2 and confirm the **existing consented
   body photos** per §4.3.
5. Split a dev set from the held-out test set and record the split.

### Phase 2 — Environment and harness

1. Start the isolated backend (existing
   [run_server.py](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/scripts/run_server.py))
   with its own DB and uploads dir.
2. Seed all random components and record the seeds.
3. Extend the harness with:
   - a stratified dataset builder,
   - a multi-wardrobe recommendation runner with the added baselines,
   - an LLM-judge labelling importer,
   - judge-agreement and confidence-interval statistics.

### Phase 3 — Execution

Run, in order: upload screening/tagging → recommendation (all conditions,
all cases) → latency → functional matrix → try-on (using the existing consented
body photos) → quality ratings. Save raw JSONL/CSV and never edit raw outputs.

### Phase 4 — Analysis

Apply the statistical plan (§6) to the raw outputs and produce the aggregated
metrics the report generator consumes.

### Phase 5 — Reporting

Regenerate `REPORT.md` and `INTERPRETATION.md` with:
- per-metric **n, point estimate, and 95 % CI**,
- an explicit **limitations** section,
- a **decision per research question** ("supported / not supported / inconclusive"),
- honest wording: always "LLM-as-a-judge preference", never "human ratings" or "user feedback".

---

## 6. Statistical analysis plan

Reporting a bare percentage is what makes the current numbers weak. A sound
report reports **uncertainty**.

| Evidence type | Recommended analysis |
| --- | --- |
| Proportions (accuracy, acceptance, rejection) | **Wilson 95 % CI** (not just `x/n`) |
| Paired classification comparison (VLM vs heuristic on the same images) | **McNemar test** |
| Tagging agreement (category/style/formality) | Cohen's κ, weighted κ, Krippendorff's α |
| Recommendation score comparison (paired conditions) | **Wilcoxon signed-rank** or bootstrap CI of the mean difference |
| Effect size for the reference ablation | **Cliff's δ** or Cohen's d with CI |
| Multiple comparisons | **Benjamini–Hochberg** correction across the RQ family |
| LLM-judge agreement for quality ratings | **pairwise agreement / Krippendorff's α / ICC(2,k)** across judges; report before trusting means |
| Latency | median + **p95/p99** + bootstrap CI |

**Pre-registered decision rule:** a claim is "supported" only if the confidence
interval excludes the null/threshold value (e.g. win rate > 0.5, p95 ≤ 20 s,
accuracy ≥ 0.80). A claim whose interval straddles the threshold is reported as
**inconclusive** — this is a feature of honesty, not a failure.

---

## 7. Tiered plan — what to do with limited time

Not every project can afford the full plan. The tiers below are cumulative.

### Tier 1 — Minimum credible (≈ 1–2 weeks of part-time work)

- **100 upload photos** stratified (≈ 60 valid + 40 negatives), with the
  `multi_item` class oversampled;
- **5 wardrobes × 5 venues** = 25 recommendation cases, full vs no-reference vs
  random + colour-matching heuristic;
- **2 LLM judges** on outfit quality and try-on quality (blind, shuffled);
- use the **existing consented body photos** for a small try-on rating;
- no human study (out of scope);
- report every proportion with a Wilson CI.

This already lifts the evaluation from "pilot" to "credible, with stated
uncertainty".

### Tier 2 — Strong (≈ 3–4 weeks)

- **150–200 upload photos** per §4.1 with two-LLM-judge labelling and agreement
  stats;
- **10–20 wardrobes × 5 venues** with context variants;
- ≥ 2 LLM judges (different models) with agreement on outfit and try-on;
- **all available consented body photos**, 30–50 try-on images;
- full statistical plan including effect sizes and multiple-comparison control.

### Tier 3 — Comprehensive (beyond the course scope)

- Larger, externally sourced dataset with demographic diversity;
- longitudinal/repeated use over days (does the wardrobe grow useful over time);
- live retailer reference refresh rather than a one-time snapshot;
- comparison against an off-the-shelf baseline (e.g. pure LLM recommendation).

**Recommendation:** aim for **Tier 1 now, Tier 2 if time allows**. Tier 1 is
cheap and directly addresses the "small n" criticism; Tier 2 makes the report
defensible to an external reviewer.

---

## 8. What to keep from the current harness — and what to add

**Keep (already well-built):**

- isolated backend DB/uploads — [run_server.py](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/scripts/run_server.py);
- the labelled CSV + JSON schema convention — [upload_label.json](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/schemas/upload_label.json);
- the `use_reference` ablation switch;
- the latency and functional scripts — [run_latency.py](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/scripts/run_latency.py), [run_functional.py](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/scripts/run_functional.py);
- the report generator and quality rubric — [quality_rubric.md](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/data/quality_rubric.md).

**Add:**

1. a **stratified dataset builder** that enforces the §4.1 quotas;
2. an **LLM-judge labelling importer** and judge-agreement calculator;
3. a **multi-wardrobe recommendation runner** with the extra baselines;
4. a **Wilson CI / bootstrap / effect-size module** in
   [analyze.py](/Users/wongtszlok/comp1945 development/COMP1945-AI-Project/evaluation/scripts/analyze.py);
5. a **pre-registration file** (the RQ table above, saved before running).

---

## 9. One-paragraph summary

A persuasive evaluation of USTyle needs **four things the current run lacks**:
a **larger, stratified, LLM-judge-labelled test set** (100 upload photos,
10–20 wardrobes, using the existing consented body photos), **independent
baselines and blind LLM judges** for quality instead of the system scoring
itself, **LLM-judge agreement** reported alongside every quality mean, and
**uncertainty reporting** (confidence intervals and effect sizes) on every
number. The existing harness already provides the safe isolation, schema, and
ablation switch — so the work is mostly *dataset construction and procedure*,
not new machinery. No human judges or user study are included, by explicit
time decision; the report states that limitation rather than hiding it.

---

## Appendix A — Prompt: have another AI agent source the image set

Copy the block below into the agent you are using to find/collect the evaluation
images. It returns a 100-image manifest ready to paste into
`evaluation/data/labels/upload_labels.csv` and `evaluation/data/uploads/`.

---

I am building a labelled image test set for **USTyle**, an AI outfit assistant
whose upload step must (a) accept exactly one standalone garment and reject
everything else, and (b) tag accepted garments with category, colour, style,
and formality.

Find and prepare **100 real photos** with this exact split.

**Part A — 60 valid "single garment" photos (must be ACCEPTED).**
10 photos per category:
- `top` — one shirt / t-shirt / polo / blouse, no person or only the isolated garment
- `bottom` — one pair of trousers / jeans / skirt / shorts
- `outerwear` — one jacket / blazer / coat / cardigan
- `dress` — one dress
- `shoes` — one pair of shoes (a single clear product)
- `accessory` — one bag / hat / belt / watch (a single standalone item)

Within those 60 valid photos, vary: colour (black, white, gray, blue, navy,
brown/beige, red, green), style (casual, smartCasual, streetwear, sporty,
minimal, formal), formality (low/mid/high), gender fit (male/female/unisex), and
photo condition (flat-lay, on hanger, mannequin, clean product shot, varied
lighting/backgrounds).

**Part B — 40 negative photos (must be REJECTED).**
- 12 `model_worn` — a person wearing a full outfit (top + bottom together)
- 12 `multi_item` — two or more garments laid out or hanging together in one photo
- 6 `collage` — split / montage / multi-panel images
- 5 `irrelevant` — a non-clothing subject (car, cat, food, furniture, etc.)
- 5 `unreadable` — extremely blurry, dark, or occluded images

**Rules.**
- Prefer real e-commerce product photos and lifestyle photos; avoid watermarked
  promos where possible, and do **not** use AI-generated images.
- Prefer licence-safe sources (public domain, CC, or retailer product pages used
  only for local academic evaluation) and record the source URL.
- No duplicates; every image must be distinct, and none may reuse the current
  20-photo set.

**Deliverable.** For each image give one CSV row with these columns (matching an
existing schema): `case_id, filename, expected_class, expected_category,
expected_color, expected_style, expected_formality, expected_gender, notes`
- `case_id`: `new-001` … `new-100`
- `filename`: `valid/<slug>.jpg` or `negative/<slug>.jpg`
- `expected_class`: `valid_single`, `model_worn`, `multi_item`, `collage`,
  `irrelevant`, or `unreadable`
- For valid rows, fill category/colour/style/formality (0–100)/gender; leave
  those blank for negative rows.
- Put the source URL and a one-line description in `notes`.

Also provide a plain list of direct image URLs so I can download them, and flag
any image you are not confident about so I can double-check it.
