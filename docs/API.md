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

type Outfit = {
  id: string;
  items: OutfitItemRef[];
  venueFitScore: number;     // 0-1
  cohesionScore: number;     // 0-1
  overallScore: number;      // 0-1
  rationale: string;
  tryOnUrl: string | null;
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

---

## Static files

Uploaded images are served at `GET /uploads/...` (same origin as API). Frontend should prefix relative `imageUrl` with the API origin only when it does not already start with `http`.
