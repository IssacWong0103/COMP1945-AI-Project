# USTyle — System, Pipelines, Evaluation Requirement, and What We've Done

> **Purpose of this document:** a single, self-contained briefing to hand to
> another AI (or teammate) to help brainstorm whether our evaluation approach is
> too complicated and how to simplify it. It describes what the system does, how
> it works internally, what the course project asks for evaluation, what we have
> built and measured, and an honest assessment of whether we are over-engineering.

---

## 1. What the system does (product level)

USTyle is a **single-user AI outfit assistant for HKUST students** (COMP1945,
Group 18). A user:

1. Uploads photos of clothes they own. The system **screens** each photo (is it
   really one standalone garment?) and **tags** it (category, colour, cut,
   style, formality, gender fit, short description).
2. Picks a **venue** (lecture, career fair, casual date, hall gathering, formal)
   and asks the system to **recommend outfits** from their closet.
3. Optionally generates a **virtual try-on** image of themselves wearing a
   chosen outfit.

It is a **campus demo**, not a production app: one user, one wardrobe, no
authentication.

### Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Python + FastAPI + SQLite (SQLAlchemy) |
| Frontend | React + TypeScript + Vite + Tailwind |
| AI (vision) | DeepSeek Flash VLM (garment screening/tagging, styling notes) |
| AI (try-on) | kie.ai GPT Image-2 (falls back to a PIL collage if unavailable) |
| Ports | backend `127.0.0.1:8018`, frontend `localhost:1945` (Vite proxies `/api` → 8018) |

---

## 2. Programming pipelines

There are three core pipelines. All are synchronous request/response calls.

### Pipeline 1 — Upload screening & tagging

```
POST /api/wardrobe/items (multipart image)
  → storage.save_upload()            # validate + resize + save image
  → vlm.describe_garment()           # call DeepSeek Flash VLM
       returns: isClothingItem, isSingleItem, rejectionReason,
                category, color, cut, style, formalityScore, itemGender, description
  → if not isClothingItem or not isSingleItem → reject (HTTP 400)
  → else save WardrobeItem row and return it
```

- Key file: `backend/app/services/vlm.py`
- There is a **heuristic attribute fallback** (`_heuristic_tags`) but it is only
  used as a fallback for tag fields; **screening still requires DeepSeek** — if
  the API key is missing or the call fails, the upload is rejected (HTTP 503).

### Pipeline 2 — Outfit recommendation

```
POST /api/recommend {venue, preferredStyle?, feedback?, weather?, timeOfDay?,
                     dressCode?, notes?, useReference=true}
  → recommend_outfits() in matching.py:
     1. filter wardrobe to venue-appropriate items
     2. generate candidate outfits (cores + optional layers/accessories)
     3. score each candidate:
          venue_fit_score  (style + venue keywords + completeness)
          cohesion_score   (colour harmony, style agreement, fit, cut)
          + reference_similarity boost   ← retailer reference contribution
          + feedback/context deltas
          overall = 0.55*venue_fit + 0.45*cohesion (+ boosts)
     4. sort, select diverse top-N
     5. _to_outfit() → attach rationale, inspiration, model_reference_url
     6. _apply_visual_styling() → DeepSeek reads the reference image and
        appends a styling note (optional)
  → persist Outfit rows, return outfits + elapsed_ms
```

- Key files: `backend/app/services/matching.py`,
  `backend/app/services/fashion_index.py` (TF-IDF/Jaccard retrieval over a
  one-time scraped `captions.jsonl` of retailer model outfits: Uniqlo, Zara,
  G2000).
- `useReference=false` skips the reference boost, the visual styling step, and
  the inspiration/reference URL — this is the **ablation switch** we added for
  evaluation.

### Pipeline 3 — Virtual try-on

```
POST /api/try-on {outfitId}
  → load saved outfit + user profile (body photo required)
  → generate_tryon() in tryon.py:
       build prompt from garments + profile (gender, skin tone, height, weight)
       upload images to kie.ai (or use public URLs)
       create + poll kie.ai task → download result
       if no key / <2 usable images / task fails → PIL collage fallback
  → return {status: ready|processing, tryOnUrl, mode: kie|collage}
```

- Key file: `backend/app/services/tryon.py`

---

## 3. The project requirement for the evaluation part

The course brief asks us to explain **how the solution was evaluated** and to
present evidence such as:

- performance metrics,
- baseline comparisons,
- test cases,
- user feedback,
- usability results,
- error analysis,
- prototype demonstrations.

Crucially, it also says: **"If the project was not fully implemented, evaluate
the solution through a realistic validation method, such as a proof of concept,
structured expert review, scenario-based testing, comparative analysis, or user
feedback."**

A separate internal handoff plan (`wolverine-stargirl-daken.md`) originally
specified a much larger evaluation (upload screening, recommendation ablation,
reference contribution, try-on visual quality, latency, functional reliability,
LLM-judge reliability, bootstrapped confidence intervals) and explicitly ruled
out a real HKUST user study.

---

## 4. What we have actually done

We scoped the large plan down to a **"focused core"** and built a reproducible
evaluation harness:

- **Backend instrumentation (small, reversible):**
  - env overrides for an **isolated** DB + uploads dir (so tests never touch the
    real wardrobe),
  - `use_reference` ablation switch,
  - try-on `mode` field (`kie` vs `collage`) so AI vs fallback is recorded.
- **Evaluation harness** in `evaluation/`:
  - labeled-dataset schema + CSV,
  - scripts: upload screening, recommendation ablation, latency, functional
    matrix, aggregator, report generator,
  - an orchestrator (`run_eval.py`) that starts an isolated backend and runs
    everything end-to-end.
- **Web UI** on `/eval`:
  - a dashboard showing the aggregated numbers,
  - a **"Run evaluation"** button that triggers the whole pipeline,
  - a **dataset manager** UI to upload images and write ground-truth labels.
- **Ground truth:** imported **20 real photos** labeled by an independent AI
  judge (10 valid single garments, 7 model-worn, 1 multi-item, 2 irrelevant),
  and one wardrobe manifest.

---

## 5. Results (from the latest run)

### 5.1 Upload screening vs the judge's answer key

| Metric | Value |
| --- | --- |
| Valid garments accepted | 100% (10/10) |
| Trick photos rejected | 90% (9/10) |
| Confusion matrix | TP 10 · FN 0 · TN 9 · FP 1 |
| The 1 error | a suit jacket + trousers shown together was accepted as one item |

### 5.2 Tagging accuracy (on the 10 accepted garments)

| Metric | VLM | Heuristic fallback |
| --- | ---: | ---: |
| Category | 100% | 40% |
| Style | 100% | 60% |
| Colour | 80% | 30% |
| Formality MAE (0–100) | 3.9 | 15.5 |
| End-to-end tagging success | 100% | — |

### 5.3 Recommendation (1 wardrobe × 3 venues — pilot)

| Condition | Internal score (0–1) |
| --- | ---: |
| Full USTyle | 1.000 |
| Without reference | 0.996 |
| Random but complete | 0.842 |

- Full vs no-reference: **3–0 wins, +0.004** (essentially a tie).
- Full vs random: **3–0 wins, +0.158** (clearly better than chance).

### 5.4 Latency (30 reps each, all successful, all within 20 s)

| Scenario | Median | p95 |
| --- | ---: | ---: |
| Upload one garment | 1.8 s | 3.5 s |
| Recommend | 6.4 s | 8.1 s |
| Upload → recommend | 7.8 s | 9.4 s |

### 5.5 Functional reliability

**9 pass / 1 fail / 1 skip** across scripted user flows. The single failure is
the same multi-item case as in 5.1.

### 5.6 Try-on

**No result** — the dataset has no consented body photo, so try-on quality is
unmeasured.

---

## 6. Interpretation of the results

1. **The screen is safe but has one real gap.** It never wrongly blocks a real
   garment, and it catches people/cars/cats — but it mis-accepts one photo of
   *two garments laid out together*. The error is systematic (repeats every
   run), so it's a genuine, fixable defect, not noise.
2. **Tagging is trustworthy.** Category/style are perfect, colour differs only
   by synonyms, formality is within ~4 points. The heuristic fallback is clearly
   worse, so the VLM is earning its place.
3. **Recommendation core works; the reference feature adds little.** The venue +
   cohesion rules beat a random outfit clearly, but removing the retailer
   reference barely changes anything (+0.004). Honest takeaway: the reference
   feature is not (yet) pulling its weight in this small test.
4. **It is fast enough to demo live** (worst-case under 10 s).
5. **Only one known edge case** in the functional flows.

---

## 7. Are we over-complicating the evaluation? (honest assessment)

**Short answer: yes, partly — and your instinct is correct.**

What we built is a **proper benchmark harness**, which is more machinery than a
course project that "was not fully implemented" strictly needs. Specifically,
these are the "heavy" parts:

- formal confusion matrices, macro-F1, MAE, median/p95 percentile latency;
- a full orchestration runner + status polling + dashboard + dataset UI;
- the original 9-section plan (judge reliability stats, bootstrapped CIs,
  wardrobe-size scaling) — most of which we did **not** build, but its ambition
  shaped the design.

What the brief actually asks for when a project is incomplete is much lighter:

> proof of concept, structured expert review, scenario-based testing,
> comparative analysis, or user feedback.

**The harness is not wasted** — it produced concrete, report-ready evidence
(the multi-item gap, "reference adds little", "fast enough to demo"). But the
*machinery* is bigger than the *audience* (a course marker + a short demo).

### Where the complexity is justified

- Isolated DB + uploads so tests don't corrupt the real closet — cheap, worth it.
- A fixed labeled test set with an independent judge as the answer key — exactly
  "structured expert review" + "comparative analysis".
- The `use_reference` ablation — the single most persuasive comparison we have.

### Where we could cut back

- The dashboard/run-button/dataset-UI could shrink to: one script + one CSV +
  one output table.
- Percentile latency / macro-F1 / bootstrap CIs are overkill for a 20-photo,
  1-wardrobe pilot; a simple table of counts and averages is enough.
- The recommendation result is only 3 cases — reporting it as a "benchmark" is
  misleading; it should be framed as a pilot/demo.

### What is actually missing (and matters more than more metrics)

The brief lists **user feedback / expert review** as valid evidence. We have the
*judge's answer key* for screening, but we have **no human (or independent-judge)
quality ratings** for "does the outfit look good?" or "does the try-on look
real?". Those are the highest-value additions for a project marked as
"not fully implemented":

1. **Scenario-based testing** — walk through 5–8 realistic user journeys and
   record pass/fail + a screenshot (we have an automated version; a human demo
   script is missing).
2. **Structured expert review** — a short rubric (1–5) rated by teammates or an
   independent AI judge on outfit quality and try-on quality, blind + shuffled.
3. **Comparative analysis** — keep only the full vs no-reference vs random
   comparison (we have it), reported as a simple win/tie/loss table.
4. **Prototype demonstration** — a live demo script with the latency evidence
   already gathered.

---

## 8. Suggested leaner evaluation (for the brainstorming AI to react to)

**Keep:**

- 20-photo labeled screening/tagging test (evidence: accuracy + the one error).
- `use_reference` ablation (evidence: reference adds little).
- A short functional scenario checklist.
- The latency table (median only — drop p95 if simplifying).

**Add (small effort, high report value):**

- A **human/judge rating rubric** (1–5) for outfit quality and try-on quality,
  recorded in a simple spreadsheet — presented as "structured expert review",
  **not** "user satisfaction".
- A **demo script** (step-by-step with expected outcomes).

**Drop or downgrade:**

- macro-F1, confusion matrix jargon, bootstrap CIs, judge-reliability statistics
  (inter-judge agreement, position bias) — mention only if asked.
- The full dashboard/runner UI if it's not needed for the demo (keep the scripts).

---

## 9. Open decisions to brainstorm

1. Should we **frame the project as "not fully implemented"** and switch the
   evaluation narrative to "proof of concept + structured expert review +
   scenario testing", rather than "benchmark with metrics"?
2. Is the **one-wardrobe recommendation result** worth keeping at all, or should
   we re-run with more wardrobes first?
3. Should the missing **try-on quality** be evaluated with a judge (needs body
   photos) or explicitly declared out-of-scope?
4. Which parts of the harness (dashboard, run button, dataset UI) are worth
   keeping for the demo vs deleting to reduce complexity?
