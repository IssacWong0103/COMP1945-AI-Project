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
};

type SearchMode = "textThenPhotos" | "simpleFallback";

type Outfit = {
  id: string;
  items: OutfitItemRef[];
  venueFitScore: number;     // 0-1
  cohesionScore: number;     // 0-1
  overallScore: number;      // 0-1
  rationale: string;
  tryOnUrl: string | null;
  styleReference?: string;   // optional wording or id; omitted until a text catalog is wired
};

type TryOnResultKind = "generated" | "collage";

type TryOnFallbackReason =
  | "local_images_not_public"
  | "provider_error"
  | "timeout"
  | "missing_key"
  | "missing_inputs";

type TryOnResponse = {
  outfitId: string;
  tryOnUrl: string | null;
  status: "ready" | "processing" | "failed";
  resultKind?: TryOnResultKind | null;       // required when status is ready and tryOnUrl is set
  fallbackReason?: TryOnFallbackReason | null;
  styleReferenceUrl?: string | null;
  detail?: string | null;                    // short drawer copy, especially on failure
};

type VenueInfo = {
  id: string;                // venue enum
  label: string;
  description: string;
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
{ "status": "ok", "service": "ustyle" }
```

### `GET /api/venues`

```json
{ "venues": VenueInfo[] }
```

### `POST /api/wardrobe/items`

`multipart/form-data` field `file` (jpeg/png/webp). Optional field `notes` (string).

Backend: save file, call DeepSeek Flash VLM, persist attributes.

Response `201`: `WardrobeItem`

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
  "description": "Crisp white cotton button-up with a pointed collar.",
  "itemGender": "unisex"
}
```

Response `200`: `WardrobeItem`

### `DELETE /api/wardrobe/items/{id}`

`204` empty body.

### `PUT /api/profile`

`multipart/form-data`:

- `file` optional body photo
- `heightCm` optional
- `weightKg` optional
- `gender` optional
- `skinTone` optional
- `preferredStyle` optional

Response `200`: `Profile`

### `GET /api/profile`

Response `200`: `Profile` (defaults all null / empty if never set)

### `POST /api/recommend`

```json
{
  "venue": "lecture",
  "preferredStyle": "casual"
}
```

`preferredStyle` optional; fall back to profile.

Response `200`:

```json
{
  "outfits": Outfit[],
  "elapsedMs": 1234,
  "searchMode": "simpleFallback"
}
```

Return **2 or 3** outfits. If wardrobe is too small, still return what is possible and include a `warning` string field (optional).

`searchMode` is optional in the contract and is one of `textThenPhotos` or `simpleFallback`. Until a fashion-photo text catalog is wired into matching, the server returns `simpleFallback` and **omits** `styleReference` on each outfit. Do not invent reference wording. The seeded `backend/app/data/reference_outfits.json` path stays as it is. When text-then-photo search exists, `searchMode` may be `textThenPhotos` and an outfit may include `styleReference` (wording or id for the chosen look).

### `POST /api/try-on`

```json
{ "outfitId": "...", "acceptPreview": false }
```

`acceptPreview` is optional and defaults to `false`. Set it to `true` only when the student tapped “Show a local preview instead.” The server may then return a local collage even if the provider cannot run (including `missing_key` or a public-URL misconfig). If `acceptPreview` is `false` or omitted, a collage is never returned as a successful try-on.

Success and expected provider/config failures use the **same** `TryOnResponse` shape and **HTTP 200**:

```json
{
  "outfitId": "...",
  "tryOnUrl": "/uploads/tryon/....jpg",
  "status": "ready",
  "resultKind": "generated",
  "fallbackReason": null,
  "styleReferenceUrl": null,
  "detail": null
}
```

| Field | When |
| --- | --- |
| `status` | `ready`, `processing`, or `failed` |
| `resultKind` | `generated` or `collage`. **Required** whenever `status` is `ready` and `tryOnUrl` is present. `collage` is a local preview, not a generated try-on. |
| `fallbackReason` | Optional. `local_images_not_public`, `provider_error`, `timeout`, `missing_key`, or `missing_inputs`. |
| `styleReferenceUrl` | Optional URL for the look’s style reference, when one exists. |
| `detail` | Optional short string for the try-on drawer. On failure it distinguishes Retry from “Show a local preview instead.” |

Expected generation/config failures (`missing_key`, `provider_error`, `timeout`, `local_images_not_public` when `acceptPreview` is not true, `missing_inputs` after a well-formed request) return HTTP 200:

```json
{
  "outfitId": "...",
  "tryOnUrl": null,
  "status": "failed",
  "resultKind": null,
  "fallbackReason": "missing_key",
  "styleReferenceUrl": null,
  "detail": "No try-on provider key is configured. Retry after it is set, or show a local preview instead."
}
```

Do **not** use HTTP 502 for those cases.

When `acceptPreview` is true and the provider cannot run, the server may return HTTP 200 with `status: "ready"`, `resultKind: "collage"`, a local `tryOnUrl`, the `fallbackReason`, and a `detail` that says it is a local preview. A missing key does not by itself return that collage.

`processing` means a provider job was accepted and is not finished when the server responds (`tryOnUrl` null). Clients should call `POST /api/try-on` again with the same `outfitId`. This server waits for the provider inside the request; if that wait elapses, the response is `failed` with `fallbackReason: "timeout"` instead of HTTP 502 or a collage. A later retry resumes the same provider task when one is still in flight.

Cached ready try-ons persist `resultKind` (and fallback metadata) and return that kind on a later hit. A cached collage is returned only when `acceptPreview` is true, still marked `resultKind: "collage"`. A ready row saved before `resultKind` existed is not served as a successful try-on.

HTTP **400** for bad requests: no body photo, unknown or invalid `outfitId`, outfit with no garments, and similar validation errors. Body is `{ "detail": "..." }`.

HTTP **5xx** only when this server itself errors. HTTP 422 remains the framework response for a body that does not match the schema (for example `acceptPreview` not a boolean).

### `GET /api/outfits`

Recent generated/saved looks gallery (camelCase).

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
- Explicit “Save look” also stores a local gallery entry for Looks tab reliability.
- Future: `POST /api/looks` with `{ "outfitId": "..." }`.

### Try-on (current)

`POST /api/try-on` + client poll until `status` is `ready` or `failed`.

- `ready` + `resultKind: "generated"` — provider image.
- `ready` + `resultKind: "collage"` — local preview. Only when the request set `acceptPreview: true` (including a later cache hit of that preview).
- `failed` + `fallbackReason` + `detail` — expected provider/config failure, still HTTP 200. `detail` tells Retry apart from “Show a local preview instead.”
- HTTP 400 — bad request. HTTP 5xx — this server errored. Do not treat `missing_key` or a public-URL misconfig as HTTP 502, and do not show those as a generated try-on.

---

## Error → recovery mapping

| HTTP | Studio recovery |
|------|-----------------|
| network / TypeError | offline panel + Alerts |
| 400 / 422 | adjust inputs |
| 200 try-on `status: "failed"` | try-on drawer failed; `detail` distinguishes Retry from “Show a local preview instead” |
| 200 try-on `resultKind: "collage"` | local preview, not a generated try-on |
| 5xx | this server errored; retry |
| 200 + warning | partial results + Retry missing looks |
| 200 + empty outfits | failure + Add clothes |

---

## Static files

Uploaded images are served at `GET /uploads/...` (same origin as API). Frontend should prefix relative `imageUrl` with the API origin only when it does not already start with `http`.
