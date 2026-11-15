# USTyle — Live Demo Script (Scenario-Based Testing)

Use this to demo the system live. Each journey lists the steps, the expected
outcome, and the evidence to capture (a screenshot or a note). The scripted
equivalents of most of these journeys also run automatically in
`evaluation/scripts/run_functional.py` (see the functional-reliability table).

Start state: the app is running with the user's real closet (13 items) and
profile (full-body photo uploaded).

---

## 1. Upload a valid garment (accept)

1. Go to **Closet** → **Add item**.
2. Pick a single standalone garment photo.
3. Submit.

**Expected:** item appears in the closet with category, colour, style, and a
short description.

**Evidence:** screenshot of the tagged item in the closet.

## 2. Upload a trick photo (reject)

1. Go to **Closet** → **Add item**.
2. Pick a photo of a person wearing a full outfit (or a car/cat).

**Expected:** upload is rejected with a reason; nothing is added.

**Evidence:** screenshot of the rejection message.

## 3. Ask for a lecture outfit

1. Go to **Studio**.
2. Choose **Lecture**, then **Recommend**.

**Expected:** a full outfit (top + bottom) with a rationale and, when enabled,
a retailer reference inspiration.

**Evidence:** screenshot of the recommended outfit.

## 4. Compare with and without the reference

1. In **Studio**, turn the retailer-reference toggle **off** and re-recommend
   for the same venue.

**Expected:** a similar outfit is returned without the reference image /
styling note.

**Evidence:** two side-by-side screenshots (reference on / off).

## 5. Virtual try-on

1. On a recommended outfit, press **Try on**.

**Expected:** a photorealistic image of the user wearing the outfit appears
(kie.ai path), or a local collage if the service is unavailable.

**Evidence:** screenshot of the try-on result.

## 6. Save and revisit a look

1. Save a recommended outfit to **Looks**.
2. Reopen it from **Looks**.

**Expected:** the saved look reloads with the same items and try-on link.

**Evidence:** screenshot of the saved look.

## 7. Empty-closet behaviour

1. In a fresh/empty closet (or the isolated evaluation instance), ask for a
   recommendation.

**Expected:** a graceful warning, not a crash.

**Evidence:** screenshot of the warning.

## 8. Offline behaviour (optional)

1. Stop the backend, then attempt any action.

**Expected:** the UI shows a connection banner and fails cleanly.

**Evidence:** screenshot of the connection banner.

---

## Demo timing notes

From the latency run (30 repetitions each):

- Upload one garment: ~1.8 s median.
- Recommend an outfit: ~6.4 s median.
- Upload → recommend: ~7.8 s median.

Keep the demo under 10 minutes: journeys 1–6 cover the three core pipelines
(screening/tagging, recommendation, try-on) plus the save/restore flow.
