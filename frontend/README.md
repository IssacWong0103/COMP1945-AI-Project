# USTyle frontend

Student-facing web app for **USTyle**, an AI outfit assistant for HKUST students (COMP1945 Group 18).

Vite + React + TypeScript + React Router + Tailwind CSS. Talks to the backend through the shared contract in `docs/API.md`.

## Run

The API should already be running at `http://127.0.0.1:8018`. Vite proxies `/api` and `/uploads` there, so the app uses relative URLs only. This app uses dedicated ports so it does not collide with other local projects on 5173/8000.

```bash
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:1945](http://127.0.0.1:1945).

If the backend is down, a banner reads: **Backend not running on port 8018**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port **1945** |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview the production build |

## Pages

- `/` — Home
- `/wardrobe` — Upload and manage clothing photos
- `/you` — Full-body photo and profile
- `/dress-me` — Venue picker, outfit recommendations, virtual try-on
