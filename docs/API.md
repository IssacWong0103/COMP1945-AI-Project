# USTyle shared API contract

Frontend (`frontend/`) and backend (`backend/`) **must** follow this contract. Do not invent extra required fields. Optional fields are marked.

Base URL (dev): `http://127.0.0.1:8018`

Frontend Vite proxy: `/api` → `http://127.0.0.1:8018/api`

CORS: allow `http://localhost:1945` and `http://127.0.0.1:1945`.

All JSON request/response bodies use camelCase.

---

## Enums

**venue**

- `lecture`
- `careerFair`
- `casualDate`
- `hallGathering`
- `formal`

**gender** (profile)

- `male`
- `female`
- `nonBinary`
- `preferNot`

**itemGender**

- `male`
- `female`
- `unisex`

**skinTone**

- `fair`
- `light`
- `medium`
- `tan`
- `deep`

**preferredStyle**

- `casual`
- `smartCasual`
- `streetwear`
- `sporty`
- `minimal`
- `formal`

**category**

- `top`
- `bottom`
- `outerwear`
- `dress`
- `shoes`
- `accessory`

---

## Types

```ts
type WardrobeItem = {
  id: string;
  imageUrl: string;          // served by backend, e.g. /uploads/wardrobe/xxx.jpg
  category: string;
  color: string;
  cut: string;
  style: string;
  formalityScore: number;    // integer 0-100, AI-generated and user-editable
  description: string;
  itemGender: string;
  createdAt: string;         // ISO-8601
};

type Profile = {
  bodyPhotoUrl: string | null;
  heightCm: number | null;
  weightKg: number | null;
  gender: string | null;
  skinTone: string | null;
  preferredStyle: string | null;
};

type OutfitItemRef = {
  id: string;
  category: string;
  color: string;
  description: string;
  imageUrl: string;
  formalityScore: number;    // integer 0-100
};

type Outfit = {
  id: string;
  items: OutfitItemRef[];
  venueFitScore: number;     // 0-1
  cohesionScore: number;     // 0-1
  overallScore: number;      // 0-1
  formalityScore: number;    // weighted outfit average, 0-100
  rationale: string;
  rationaleItems: { itemId: string; reason: string }[];  // per-item "why this works"
  inspiration: string | null;                            // best-matching Fashion DB reference
  tryOnUrl: string | null;
};

type VenueInfo = {
  id: string;                // venue enum
  label: string;
  description: string;
  formalityMin: number;      // inclusive minimum core-garment score
  formalityMax: number;      // inclusive maximum core-garment score
};
```

Error shape:

```json
{ "detail": "Human readable message" }
```

---

## Endpoints

### `GET /api/health`

```json
{
  "status": "ok",
  "service": "ustyle",
  "deepseekConfigured": true,
  "kieConfigured": true,
  "kiePublicUrlReady": false
}
```

`kiePublicUrlReady` is true only when `PUBLIC_BASE_URL` is set to a non-loopback
origin so kie.ai can fetch uploaded images for virtual try-on directly. When it
is false, the backend uploads local images to kie.ai's File Upload API first,
so virtual try-on still works without a public tunnel as long as `KIE_API_KEY`
is configured.

### `GET /api/venues`

```json
{ "venues": VenueInfo[] }
```

### `POST /api/wardrobe/items`

`multipart/form-data` field `file` (jpeg/png/webp). Optional field `notes` (string).

Backend: save file, call DeepSeek Flash VLM, validate that the photo contains one clothing item on its own, and persist attributes. A matching pair of shoes counts as one item. Photos of models, full or partial outfits, multiple items, collages, or non-clothing subjects are rejected.

Response `201`: `WardrobeItem`

Response `400`: `{ "detail": "Upload one clothing item on its own ..." }` when the image is invalid or fails the single-item check. Rejected uploads are not stored.

### `GET /api/wardrobe/items`

```json
{ "items": WardrobeItem[] }
```

### `PATCH /api/wardrobe/items/{id}`

JSON body. All fields optional; omitted fields stay as they are.

```json
{
  "category": "top",
  "color": "white",
  "cut": "regular fit",
  "style": "smartCasual",
  "formalityScore": 75,
  "description": "Crisp white cotton button-up with a pointed collar.",
  "itemGender": "unisex"
}
```

Response `200`: `WardrobeItem`

### `DELETE /api/wardrobe/items/{id}`

`204` empty body.

### `PUT /api/profile`

`multipart/form-data`:

- `file` optional full-body photo (head-to-toe, face clearly visible; the photo is AI-checked before it is accepted)
- `heightCm` optional
- `weightKg` optional
- `gender` optional
- `skinTone` optional
- `preferredStyle` optional

Response `200`: `Profile`

### `GET /api/profile`

Response `200`: `Profile` (defaults all null / empty if never set)

### `POST /api/profile/analyze-photo`

`multipart/form-data`:

- `file` full-body photo to analyze (not saved to the profile)

Response `200`: `ProfilePhotoAnalysis`

```json
{
  "gender": "female",
  "skinTone": "#c68a5b"
}
```

Both fields are nullable. The UI uses this to pre-fill gender and skin tone when
a user chooses a photo, before they save their profile.

### `POST /api/recommend`

```json
{
  "venue": "lecture",
  "preferredStyle": "casual",
  "feedback": "Too formal — make it more casual.",
  "weather": "hot",
  "timeOfDay": "day",
  "dressCode": "smartCasual",
  "notes": "Standing all day, indoor event"
}
```

`preferredStyle` optional; fall back to profile.
`feedback` optional; free-form refinement text that re-ranks and re-samples the
candidate looks (see the Studio refinement loop below).
`weather` optional (`hot` | `mild` | `rainy` | `cold`), `timeOfDay` optional
(`day` | `evening`), `dressCode` optional (`casual` | `smartCasual` | `formal`),
`notes` optional free-form occasion context.

Response `200`:

```json
{
  "outfits": Outfit[],
  "elapsedMs": 1234
}
```

Return **2 or 3** outfits. If wardrobe is too small, still return what is possible and include a `warning` string field (optional).

### `POST /api/try-on`

```json
{ "outfitId": "..." }
```

Response `200`:

```json
{
  "outfitId": "...",
  "tryOnUrl": "https://...",
  "status": "ready"
}
```

If generation is still running: `{ "outfitId", "tryOnUrl": null, "status": "processing" }`

If failed: HTTP 502 with `{ "detail": "..." }`

### `GET /api/outfits`

Recent generated looks gallery (camelCase). The Looks UI uses the client-side saved-looks store instead.

Response `200`:

```json
{ "looks": SavedLook[] }
```

```ts
type SavedLook = {
  id: string;
  venue: string;
  overallScore: number;
  createdAt: string;       // ISO-8601
  thumbnailUrl: string | null;
};
```

---

## Studio pipeline contracts (BA handoff)

These map UI Studio actions to services. Current product uses `POST /api/recommend` as the run creator. Future async run APIs below are optional extensions — frontend already models the state machine for them.

### Run create (current)

`POST /api/recommend` is the Studio **Create outfits** pipeline.

Partial success: return fewer than requested outfits and set `warning`.

Failure: non-2xx with `{ "detail": "..." }`.

### Run status (future / optional)

`GET /api/studio/runs/{runId}`

```json
{
  "runId": "...",
  "status": "queued|running|partial|completed|failed",
  "outfits": Outfit[],
  "warning": null,
  "elapsedMs": 1200
}
```

### Swap a piece (future / optional)

`POST /api/studio/swaps`

```json
{
  "outfitId": "...",
  "slot": "top",
  "replacementItemId": "...",
  "constraints": { "keepVenue": true }
}
```

Response `200`:

```json
{ "outfit": Outfit }
```

Until this endpoint ships, the frontend applies swaps client-side from `GET /api/wardrobe/items` candidates of the same category.

### Save look (current hybrid)

- Generation already persists outfits via recommend.
- Explicit “Save look”/“Save photo” stores a local gallery entry for the Looks tab.
- Future: `POST /api/looks` with `{ "outfitId": "..." }`.

### Try-on (current)

`POST /api/try-on` + client poll until `status=ready` or timeout/502.

---

## Error → recovery mapping

| HTTP | Studio recovery |
|------|-----------------|
| network / TypeError | offline panel + Alerts |
| 400 / 422 | adjust inputs |
| 502 try-on | try-on failed + Retry |
| 200 + warning | partial results + Retry missing looks |
| 200 + empty outfits | failure + Add clothes |

---

## Static files

Uploaded images are served at `GET /uploads/...` (same origin as API). Frontend should prefix relative `imageUrl` with the API origin only when it does not already start with `http`.
