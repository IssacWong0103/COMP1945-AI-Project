# USTyle evaluation — pre-registration

Written **before** the held-out run on 2026-11-18. Analysis choices below are
frozen; results will be reported against these thresholds even if they miss.

## Dataset (adjusted to the cleaned photo set)

| Split | n | Role |
| --- | ---: | --- |
| Held-out test | **159** (120 valid + 39 negative) | Final evidence |
| Dev (previous smoke set) | 20 | Prompt/rule tuning only — **not** reported as test evidence |

The recommended plan asked for 100 photos (60+40). The cleaned set is larger on
the valid side and one short on `multi_item` (11, not 12). We use **all 159**
rather than subsampling.

Three borderline photos stay as hard `valid_single` cases: `outerwear-019`,
`shoes-018`, `accessory-014`.

## Research questions and decision rules

A claim is **supported** only if the 95 % interval excludes the null/threshold.
An interval that straddles the threshold is **inconclusive**.

| RQ | Metric | Threshold |
| --- | --- | --- |
| RQ1 | Valid recall; per-negative-class rejection | ≥ 0.95 valid recall; ≥ 0.90 per negative class |
| RQ2 | Category / style / colour accuracy; formality MAE | ≥ 0.85 / ≥ 0.85 / ≥ 0.80; MAE ≤ 10 |
| RQ3 | Pairwise win rate vs random and colour-match; blind LLM-judge median | Win rate > 0.5 with CI excluding 0.5; median ≥ 3.5/5 |
| RQ4 | Full vs no-reference mean difference + Cliff's δ | Report effect size and CI; decide on the interval |
| RQ5 | Latency p95, success rate | p95 ≤ 20 s; success ≥ 0.95 |
| RQ6 | Try-on rubric means, ≥ 2 LLM judges | Mean ≥ 3.5/5 with reported judge agreement |
| RQ7 | Usability | Out of scope (no human study) |
| RQ8 | Functional pass rate | ≥ 0.90, every failure triaged |

## Procedure (order)

1. Two independent LLM judges label class + attributes; third pass adjudicates.
2. Isolated backend (`evaluation/scripts/run_server.py`).
3. Upload screening/tagging on all 159 test images.
4. Five wardrobe manifests × five venues × four conditions (full, no-reference,
   random, colour-match heuristic).
5. Latency 30 reps (upload / recommend / upload-to-recommend); try-on if body
   photos are accepted.
6. Functional matrix (≥ 15 scenarios).
7. Blind LLM-judge quality ratings (outfit + try-on).
8. Analyze with Wilson CIs; regenerate `REPORT.md` / `INTERPRETATION.md`.

Ground truth is **LLM-as-a-judge**, never USTyle scoring itself. Judges use a
labelling prompt distinct from the product screening prompt.
