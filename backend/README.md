# USTyle backend

FastAPI service for COMP1945 Group 18 — AI outfit assistant for HKUST students.

Single-user school demo (no auth). One wardrobe and one profile.

## Setup

Python 3.9+ (3.10+ recommended). From this `backend/` directory:

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` if you have keys:

```
DEEPSEEK_API_KEY=          # DeepSeek Flash VLM for wardrobe tagging
KIE_API_KEY=               # kie.ai GPT Image-2 virtual try-on
PUBLIC_BASE_URL=           # public HTTPS origin so kie can fetch /uploads/... (e.g. ngrok)
```

The app runs without keys: wardrobe tagging uses filename/color heuristics, and try-on falls back to a labeled collage.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

API: `http://127.0.0.1:8000`  
Docs: `http://127.0.0.1:8000/docs`  
Health: `http://127.0.0.1:8000/api/health`

Frontend (Vite) should proxy `/api` to this origin. CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`.

## Optional Fashion_DB indexer

```bash
python scripts/index_fashion_db.py
```

Writes `app/data/fashion_db_index.json` from Uniqlo/Zara folder names. Recommendation already works from the seeded `app/data/reference_outfits.json`.

## Contract

JSON is camelCase. Endpoints and enums match `docs/API.md` at the repo root.
