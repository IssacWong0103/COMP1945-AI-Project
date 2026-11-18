# How We Evaluated USTyle — and What the Results Mean

This document explains, in plain language, how we tested the system on the
cleaned 159-photo set, what the numbers show, and what they do *not* yet show.

All quality and attribute labels are **LLM-as-a-judge**, not human ratings and
not a user study. The previous 20-photo run is **dev data** and is not counted
as test evidence.

Pre-registered questions and thresholds are in
[`PREREGISTRATION.md`](PREREGISTRATION.md). A claim is **supported** only if the
95 % interval excludes the threshold; an interval that straddles it is
**inconclusive**.

---

## 1. The exam (held-out test set)

We used **all 159 cleaned photos** (larger than the plan’s 100-image target):

| Group | Count |
| --- | ---: |
| Valid single garments | 120 (top 19, bottom 20, outerwear 20, dress 20, shoes 21, accessory 20 after judge labels) |
| `model_worn` | 14 |
| `multi_item` | 11 |
| `collage` | 4 |
| `irrelevant` | 6 |
| `unreadable` | 4 |

Three borderline photos (`outerwear-019`, `shoes-018`, `accessory-014`) were kept
as hard valid cases, as agreed before the run.

**Judge agreement on the answer key** (two DeepSeek Flash judges, different
temperature and prompt wording; 60 conflicts adjudicated):

| Label | Agreement |
| --- | --- |
| Class (accept/reject type) | raw 0.987, Cohen’s κ **0.97** |
| Category | κ **0.98** |
| Style | κ **0.80** |
| Gender | κ 0.73 |
| Colour (synonym-normalised) | raw 0.75 |
| Formality | MAE 5.3 points between judges |

Class and category labels are trustworthy. Colour and gender are the noisier
attributes — that uncertainty is why colour/style claims below are reported with
intervals, not bare percentages.

---

## 2. Results, and what each one means

### 2.1 Upload screening — 158 / 159 screening decisions correct

- **119/120 valid garments accepted** (99.2 %, Wilson 95 % CI 95.4–99.9 %).
- **39/39 invalid photos rejected**, including **all 11 `multi_item` photos** —
  the failure mode that beat the 20-photo pilot.
- **One false reject:** `valid/shoes/shoes-002.jpg` was treated as a worn outfit
  rather than a standalone pair of shoes.
- One valid upload hit a transient 503 and succeeded on retry; it is counted as
  accepted.

**RQ1 decision.** Valid recall **supported** (≥ 0.95; CI sits above 0.95).
Overall false-acceptance is 0/39 (CI 0–9 %). Per-negative-class “≥ 0.90”
thresholds are **inconclusive** because n is small (the point estimate is 1.0
for every class, but the lower bound for `collage`/`unreadable` is 0.51). The
honest reading: the screen is strong on this set, including the previously
known `multi_item` gap, with one remaining shoe miss.

### 2.2 Tagging — category is solid; colour/style sit on the threshold

On the 119 accepted valid garments, versus the LLM-judge answer key:

| Attribute | Point estimate | 95 % CI | Pre-registered bar |
| --- | ---: | --- | --- |
| Category | 100 % | 96.9–100 % | ≥ 0.85 → **supported** |
| Style | 84.9 % | 77.3–90.2 % | ≥ 0.85 → **inconclusive** |
| Colour | 84.0 % | 76.4–89.5 % | ≥ 0.80 → **inconclusive** |
| Formality MAE | 4.4 | — | ≤ 10 → **supported** |
| End-to-end (accept + correct category) | 99.2 % | 95.4–99.9 % | — |

Colour misses are mostly naming (light grey vs gray, off-white vs white, dark
blue vs navy), which matches the noisier judge agreement on colour. Style is
one percentage point under the 0.85 bar; the interval includes both “pass” and
“fail”, so we do not claim it.

The heuristic baseline still **accepts every negative photo**. VLM’s clear win
is screening, not category (the filename/heuristic category baseline is already
high on this set).

**RQ2 decision.** Category and formality **supported**. Colour and style
**inconclusive**.

### 2.3 Recommendation — beats random and colour-match; reference boost is small

Five wardrobes × five venues (25 cases). One wardrobe is *intentionally*
incomplete (tops only); the live API refuses to recommend without top + bottom +
shoes, so full / no-reference have 20 scored cases and 5 empty/error cases.
Random and colour-match still emit an outfit (they are offline baselines).

| Condition | Overall mean (self-score 0–1) |
| --- | ---: |
| Full USTyle (with retailer reference) | 0.911 |
| No reference | 0.892 |
| Colour-match heuristic | 0.801 |
| Random complete-ish outfit | 0.746 |

- Full vs random: **20 / 0 / 0** wins, mean difference **+0.153**.
- Full vs colour-match: **18 / 0 / 2**, mean difference **+0.091**.
- Full vs no-reference: **20 / 0 / 0**, mean difference **+0.019**, Cliff’s δ
  **0.295**.

**Honest caveat on RQ4:** the system’s own `overall_score` includes a built-in
reference boost (`REFERENCE_BOOST = 0.08`). A 0.019 mean gap and a clean 20–0
win rate therefore overstate the *user-visible* value of the retailer
reference. Venue-fit and cohesion means are **identical** for full and
no-reference (0.873 / 0.928). The reference is adding ranking juice, not better
venue or colour logic.

Blind LLM-judge outfit quality (12 outfits, two judges, 24 ratings):

| Question | Mean / 5 |
| --- | ---: |
| Venue appropriate | 4.17 |
| Visually cohesive | 3.92 |
| Complete outfit | 4.88 |
| Practical to wear | 3.96 |
| **Overall** | **4.23** |

Judge agreement (scores within 1 point) = **1.00**. This is a much stronger
outfit-quality signal than the 20-photo pilot (3.17 / 5), on a wider venue set.

**RQ3 decision.** Win vs random **supported**. Blind-judge mean ≥ 3.5/5
**supported**. **RQ4** (does the reference add value?): the self-score gap is
small and partly mechanical; independent venue-fit/cohesion did not move.
Report as **small / inconclusive as a product win**.

### 2.4 Latency — comfortably under 20 s

30 successful reps each (recommend re-measured on a complete closet):

| Scenario | Median | p95 | p99 | ≤ 20 s |
| --- | ---: | ---: | ---: | ---: |
| Upload | 2.1 s | 3.2 s | 4.3 s | 100 % |
| Recommend | 6.4 s | 10.8 s | 11.6 s | 100 % |
| Upload then recommend | 6.9 s | 8.5 s | 9.1 s | 100 % |
| Try-on | not measured | — | — | — |

**RQ5 decision.** p95 ≤ 20 s and success ≥ 0.95 **supported** for upload and
recommend. Try-on latency is **not measured** (see §2.6).

### 2.5 Functional reliability — 16 / 19, one systematic gap

Pass rate **0.842** (16 passed, 3 failed, 1 skipped). Target was ≥ 0.90.

Every passing row is a real user flow (valid upload, all five negative classes,
duplicate upload, retry, save/restore, all five venues on a complete closet,
try-on without a body photo, offline).

The **three failures are the same product rule**: `/api/recommend` returns 400
unless the closet already has a top, a bottom, and shoes.

| Failed case | Actual |
| --- | --- |
| Empty wardrobe (plan: 200 + warning) | 400 |
| Incomplete wardrobe — tops only (plan: 200 best-available) | 400 |
| Formal venue with only casual tops (plan: graceful fallback) | 400 |

This is a **deliberate hard gate**, not a flaky test. It is also why the
tops-only wardrobe scored empty on full / no-reference. Worth reporting as the
main remaining UX gap: a student with a partial closet gets an error instead of
a best-available outfit.

**RQ8 decision.** **Not supported** (0.842 < 0.90). Failures triaged: one
complete-closet policy.

### 2.6 Try-on — not re-measured on this set

Two images from `backend/uploads/profile/` were copied into the eval body-photo
folder. Both were **rejected** as not full-body / not usable, so no try-on
images were generated and RQ6 has **no new evidence**. Previous-run try-on
scores (mean 4.50 / 5 on 6 images) stay historical and are not mixed into this
report.

**RQ6 decision.** **Not evaluated** this run.

---

## 3. Summary table (pre-registered decisions)

| RQ | Result | Decision |
| --- | --- | --- |
| RQ1 screening | Valid recall 0.992 [0.954, 0.999]; 39/39 negatives rejected | **Supported** for valid recall; per-class 0.90 **inconclusive** (small n) |
| RQ2 tags | Category 1.00; formality MAE 4.4; colour 0.84; style 0.85 | Category + formality **supported**; colour/style **inconclusive** |
| RQ3 recommend | 20–0 vs random; judge mean 4.23/5 | **Supported** |
| RQ4 reference | +0.019 self-score, δ=0.295; venue-fit unchanged | **Inconclusive** as a product win |
| RQ5 latency | p95 upload 3.2 s, recommend 10.8 s, all ≤ 20 s | **Supported** (try-on excluded) |
| RQ6 try-on | Body photos rejected; no images | **Not evaluated** |
| RQ7 usability | Out of scope | — |
| RQ8 functional | 16/19 = 0.842; 3 complete-closet 400s | **Not supported** |

---

## 4. Limitations (state these in any write-up)

- **LLM-as-a-judge, not humans.** Labels and outfit scores are from DeepSeek
  Flash. Class/category agreement is high (κ ≈ 0.97–0.98); colour/gender are
  weaker. This is not user satisfaction.
- **No human study** (RQ7 out of scope).
- **Course-scale set.** 159 photos and 5 wardrobes is Tier 1. Per-negative-class
  intervals are wide even when the point estimate is 1.0.
- **Self-score for recommendation** includes a reference boost, so RQ4 must not
  be over-claimed.
- **Try-on not re-run.** Available profile images were not accepted as
  full-body.
- **External APIs.** One 503 on upload was retried; latency and a few tags can
  shift between runs.

## 5. One-line conclusion

On a 159-photo held-out set, USTyle **accepts real garments, now rejects
multi-item photos, tags category/formality reliably, beats random and
colour-match recommendations, and stays under 10–11 s at p95** — while
**colour/style accuracy and the retailer-reference boost remain too close to
call**, and **incomplete closets are hard-rejected instead of falling back**.
