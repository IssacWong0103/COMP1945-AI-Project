# USTyle Evaluation Report

Generated: `2026-11-14T08:24:49.950989+00:00` — git `7a4bb6e05ed138e4a62ad09f39c56d915023486b`

This report is produced by the reproducible `evaluation/` pipeline against an isolated backend instance. All metrics are objective and programmatic; no human user study was performed.

## 1. Upload screening and tagging

_How to read: acceptance/rejection rates measure the screen (false rejection = valid photos wrongly blocked, false acceptance = invalid photos wrongly let in — both should be low). Category/color/style accuracy is measured over accepted photos only; end-to-end tagging success is the honest headline number because a wrongly rejected valid photo still counts against it._

| Confusion matrix | Predicted accept | Predicted reject |
| --- | ---: | ---: |
| Actually valid | TP = 0 | FN = 6 |
| Actually invalid | FP = 0 | TN = 4 |

| Metric | VLM | Heuristic baseline |
| --- | ---: | ---: |
| Valid acceptance rate | 0.000 | 1.000 |
| False rejection rate | 1.000 | 0.000 |
| False acceptance rate | 0.000 | 1.000 |
| Category accuracy | 0.000 | — |
| Category macro-F1 | 0.000 | — |
| Color accuracy | 0.000 | — |
| Style accuracy | 0.000 | — |
| Formality MAE (0–100) | — | — |
| End-to-end tagging success | 0.000 | — |

Counts: 6 valid, 4 negative, 0 accepted-valid, 0 unavailable.

Rejection-reason distribution:
- Plain blue placeholder graphic with text label; no clothing item or accessory is: 1
- Image is a solid navy placeholder with text only; no clothing item or accessory : 1
- Image is a flat red placeholder swatch with text label, not a photo of a garment: 1
- Image is a blank placeholder with only faint text; no clothing item or accessory: 1
- Image is a plain black placeholder frame with a text label; no clothing item or : 1
- Image is a plain gray placeholder with text, no clothing item visible: 1
- Abstract image of two colored blocks with text; no clothing or accessory present: 1
- Image shows two plain colored rectangles with text, not a clothing item or acces: 1
- Image contains only the placeholder text 'OBJECT' on a blank background; no clot: 1
- Image is a blank white page with placeholder text, no clothing item visible: 1

## 2. Recommendation ablation

_How to read: overall score (0–1) is the system's own ranking, so compare conditions rather than trusting the absolute value. If full beats no-reference more often and by more, retailer-reference styling adds value; if it ties, venue/cohesion rules are doing the work. Complete rate is the share of cases with a full outfit; fallback rate is the share of best-effort returns._

| Condition | Cases | Overall mean | Venue-fit mean | Cohesion mean | Complete rate | Fallback rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| full | 0 | — | — | — | — | — |
| no_reference | 0 | — | — | — | — | — |
| random | 0 | — | — | — | — | — |

Full vs no-reference: win/tie/loss = 0/0/0; mean overall-score difference = —
Full vs random: win/tie/loss = 0/0/0; mean overall-score difference = —

## 3. Latency

_How to read: median is the typical wait; p95 is the wait in the slowest 5% of runs (what you feel in a demo). The ≤20 s rate is the share of successful upload-to-recommend runs under the 20-second target (aim ≥0.95). A large median–p95 gap means occasional slow runs, usually external API tail latency._

| Scenario | Count | Successful | Median | p95 | Max | ≤20 s rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| upload | 30 | 0 | 1202.200 ms | 1424.400 ms | 1563.600 ms | — |
| recommend | 30 | 30 | 1.300 ms | 1.900 ms | 44.700 ms | 1.000 |
| upload_to_recommend | 30 | 0 | 1218.800 ms | 1447.500 ms | 1510.800 ms | — |
| tryon | 5 | 0 | — | — | — | — |

## 4. Functional reliability

_How to read: pass rate is the share of defined user-flow scenarios that behaved as expected (aim ≥0.9). Each row compares expected vs actual HTTP status; SKIP means the scenario could not be exercised in this environment._

Pass rate: 0.900 (9 passed, 1 failed, 2 skipped)

| Case | Expected | Actual | Result |
| --- | --- | --- | --- |
| valid-upload — A valid single-garment image is accepted (201). | 201 | 400 | FAIL |
| reject-irrelevant — irrelevant image is rejected (400). | 400 | 400 | PASS |
| reject-multi-item — multi item image is rejected (400). | 400 | 400 | PASS |
| reject-collage — collage image is rejected (400). | 400 | 400 | PASS |
| reject-unreadable — unreadable image is rejected (400). | 400 | 400 | PASS |
| empty-wardrobe — Recommend on an empty wardrobe returns 200 with a warning. | 200 | 200 | PASS |
| incomplete-wardrobe — Recommend with only a top returns 200 (best available) with a warning. | 200 | 200 | PASS |
| recommend-retry — Recommendation retry succeeds twice (200). | 200 | 200 | PASS |
| save-restore — Saved looks are retrievable after recommendation (200). | 200 | 200 | PASS |
| tryon-no-body-photo — Try-on without a profile body photo returns 400 — skipped: no saved outfit available. | 400 | None | SKIP |
| screening-unavailable — Upload when screening is unavailable (503) — skipped: DeepSeek is configured. | 503 | None | SKIP |
| offline-api — A request to an unavailable server fails cleanly (connection error). | None | None | PASS |

## 5. Summary

| Metric | Full-system | Baseline | Target | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Upload end-to-end tagging success | 0.000 | — (heuristic cat) | ≥ 0.80 | VLM adds screening value over accept-all heuristic |
| Upload-to-recommend p95 | 1447.500 ms | — | ≤ 20000 ms | Tail-latency health of the real-AI path |
| Functional pass rate | 0.900 | — | ≥ 0.90 | Reliability of core user flows |

## 6. Limitations

- Static one-time retailer-reference snapshot; no seasonal lookbook claims.
- No human user study; LLM judge scores (if added later) are judge preference, not user satisfaction.
- Small fixed test sets and external API variability limit generalization.
- Style accuracy is an exact-enum match proxy; subjective style judgments are deferred to a multimodal judge.
