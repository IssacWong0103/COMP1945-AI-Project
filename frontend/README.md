# USTyle frontend

Student-facing web app for **USTyle**, an AI outfit assistant for HKUST students (COMP1945 Group 18).

Vite + React + TypeScript + React Router + Tailwind CSS. Talks to the backend through the shared contract in `docs/API.md`.

## Run

The API should already be running at `http://127.0.0.1:8000`. Vite proxies `/api` and `/uploads` there, so the app uses relative URLs only.

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

If the backend is down, a banner reads: **Backend not running on port 8000**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port **5173** |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview the production build |

## Pages

- `/` — Home
- `/wardrobe` — Upload and manage clothing photos
- `/you` — Full-body photo and profile
- `/dress-me` — Venue picker, outfit recommendations, virtual try-on
