# USTyle Evaluation Report

Generated: `2026-11-15T16:53:24.360538+00:00` — git `990c2ec0ab085d9b6ec4cd644c0b8c9237c32673`

USTyle is evaluated as a **proof-of-concept AI outfit assistant**: a small reproducible test set (screening and tagging), a comparative pilot for recommendations, measured latency, scripted functional scenarios, and a structured expert review of outfit and try-on quality. All quality ratings come from an independent AI judge — not a human user study.

## 1. Upload screening and tagging

_How to read: the screen must accept every real garment and reject everything else. Accuracy is measured on the 20-photo labeled set; end-to-end tagging success is the headline number because a wrongly rejected valid photo still counts against it._

- **10/10** valid garments accepted; **9/10** invalid photos rejected.

| Metric | VLM | Heuristic baseline |
| --- | ---: | ---: |
| Valid acceptance rate | 1.000 | 1.000 |
| False rejection rate | 0.000 | 0.000 |
| False acceptance rate | 0.100 | 1.000 |
| Category accuracy | 1.000 | 0.400 |
| Color accuracy | 0.800 | 0.300 |
| Style accuracy | 1.000 | 0.600 |
| Formality MAE (0–100) | 3.900 | 15.500 |
| End-to-end tagging success | 1.000 | — |

Counts: 10 valid, 10 negative, 10 accepted-valid, 0 unavailable.

Rejection-reason distribution:
- Model wearing a full outfit of multiple items (shirt, tie, trousers), not one st: 1
- Photo shows a male model wearing a full outfit (t-shirt, trousers, shoes), not o: 1
- Photo shows a model wearing the cable-knit polo along with trousers and a watch,: 1
- Photo shows a model wearing an outfit with multiple separate items (top, shorts,: 1
- Photo shows a red car on a road, not a clothing item or accessory.: 1
- The photo shows a cat, not a clothing item or fashion accessory.: 1
- Photo shows a man wearing a full outfit (polo shirt, jeans, sunglasses), not one: 1
- Model wearing a full outfit (black tank top and jeans), not a single standalone : 1
- Photo shows a person wearing a full outfit with multiple items rather than one s: 1

## 2. Recommendation comparison (pilot)

_How to read: this is a small pilot (1 wardrobe × 3 venues), not a benchmark. The overall score (0–1) is the system's own ranking, so compare conditions rather than trusting the absolute value. If full beats no-reference by a lot, the retailer reference adds value; if it ties, venue/cohesion rules are doing the work._

| Condition | Cases | Overall mean | Venue-fit mean | Cohesion mean | Complete rate | Fallback rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| full | 3 | 1.000 | 1.000 | 0.990 | 1.000 | 0.000 |
| no_reference | 3 | 0.996 | 1.000 | 0.990 | 1.000 | 0.000 |
| random | 3 | 0.842 | 0.770 | 0.930 | 1.000 | 0.000 |

Full vs no-reference: win/tie/loss = 3/0/0; mean overall-score difference = 0.004
Full vs random: win/tie/loss = 3/0/0; mean overall-score difference = 0.158

## 3. Latency

_How to read: median is the typical wait; the ≤20 s rate is the share of successful runs under the 20-second demo target (aim ≥0.95)._

| Scenario | Count | Successful | Median | ≤20 s rate |
| --- | ---: | ---: | ---: | ---: |
| upload | 30 | 30 | 1763.300 ms | 1.000 |
| recommend | 30 | 30 | 6371.600 ms | 1.000 |
| upload_to_recommend | 30 | 30 | 7754.700 ms | 1.000 |
| tryon | 5 | 0 | — | — |

## 4. Functional reliability

_How to read: pass rate is the share of defined user-flow scenarios that behaved as expected (aim ≥0.9). Each row compares expected vs actual HTTP status; SKIP means the scenario could not be exercised in this environment._

Pass rate: 0.900 (9 passed, 1 failed, 1 skipped)

| Case | Expected | Actual | Result |
| --- | --- | --- | --- |
| valid-upload — A valid single-garment image is accepted (201). | 201 | 201 | PASS |
| reject-model-outfit — model worn image is rejected (400). | 400 | 400 | PASS |
| reject-irrelevant — irrelevant image is rejected (400). | 400 | 400 | PASS |
| reject-multi-item — multi item image is rejected (400). | 400 | 201 | FAIL |
| empty-wardrobe — Recommend on an empty wardrobe returns 200 with a warning. | 200 | 200 | PASS |
| incomplete-wardrobe — Recommend with only a top returns 200 (best available) with a warning. | 200 | 200 | PASS |
| recommend-retry — Recommendation retry succeeds twice (200). | 200 | 200 | PASS |
| save-restore — Saved looks are retrievable after recommendation (200). | 200 | 200 | PASS |
| tryon-no-body-photo — Try-on without a profile body photo returns 400. | 400 | 400 | PASS |
| screening-unavailable — Upload when screening is unavailable (503) — skipped: DeepSeek is configured. | 503 | None | SKIP |
| offline-api — A request to an unavailable server fails cleanly (connection error). | None | None | PASS |

## 5. Summary

| Metric | Full-system | Baseline | Target | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Upload end-to-end tagging success | 1.000 | 0.400 (heuristic cat) | ≥ 0.80 | VLM adds screening value over accept-all heuristic |
| Upload-to-recommend median | 7754.700 ms | — | ≤ 20000 ms | Typical end-to-end wait for the live demo |
| Functional pass rate | 0.900 | — | ≥ 0.90 | Reliability of core user flows |

## 6. Structured quality review (AI judge)

_How to read: an independent AI judge rated each item on a 1–5 rubric (blind to the system's own scores, shuffled order). These are judge-preference scores, not human feedback._

**Outfit quality (venue fit, cohesion, completeness, wearability)** — 6 items, mean 3.170 / 5

| Rubric question | Mean |
| --- | ---: |
| Venue appropriate | 2.670 |
| Visually cohesive | 3.170 |
| Complete outfit | 3.500 |
| Practical to wear | 3.330 |

**Try-on quality (identity, proportions, realism, artifacts, garments kept)** — 6 items, mean 4.500 / 5

| Rubric question | Mean |
| --- | ---: |
| Same person | 5.000 |
| Natural proportions | 4.830 |
| Photorealistic | 4.330 |
| No artifacts | 4.170 |
| Garments kept | 4.170 |


## 7. Limitations

- **Small scale:** a 20-photo labeled set and a 1-wardrobe recommendation pilot — directional evidence, not general proof.
- **Reference adds little:** the retailer-reference feature barely changed results (+0.004), so venue/cohesion rules are doing the work.
- **No human study:** quality ratings are AI-judge preference, not user satisfaction or usability.
- **Static data:** one-time retailer snapshot and external API variability limit generalization.
