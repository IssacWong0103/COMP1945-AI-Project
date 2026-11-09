# Studio Interface — Engineering Spec (BA Handoff)

This document is the implementable handoff from the Figma Studio redesign. Source UI frames: `08–15` in the Untitled Figma file. Frontend implementation lives under `frontend/src/studio/*` and `frontend/src/pages/Studio.tsx`.

## 1. Information architecture (left sidebar)

| Tab | Route | Owns |
|-----|-------|------|
| Home | `/` | Overview, setup progress, quick create |
| Closet | `/wardrobe` | Upload/edit/delete wardrobe items |
| Studio | `/studio` | Plan → create → results → try-on/swap/save |
| Looks | `/looks` | Saved outfits gallery |
| Try-On | `/try-on` | Try-on session history / queue narrative |
| Activity | `/activity` | Chronological action log |
| Alerts | `/alerts` | API offline, failed runs, render failures |
| Settings | `/settings` | Body photo, fit attrs, preferred style (was Me/Profile) |

Legacy redirects: `/dress-me` → `/studio`, `/profile` → `/settings`.

**Ownership rules**
- Creation work stays in Studio.
- Durable outputs live in Looks.
- Async try-on visibility lives in Try-On + Studio drawer.
- Failures surface in Alerts with one next action.
- System status (API connected) remains in the sidebar footer.

## 2. Action placement system

Canonical map: `frontend/src/studio/actionLayout.ts`

| Zone | Allowed actions | Rule |
|------|-----------------|------|
| Top global | Create / Saved looks tabs | Navigation only; not generation CTA |
| Left panel | Create outfits (primary) | Single sticky primary CTA |
| Result card primary | Try on, Swap a piece, Save look | Per-outfit only |
| Result card secondary | Download, Remove | Destructive requires confirm |
| Drawer footer | Close, Retry try-on, Save | Overlay-scoped |
| Recovery | Retry, Adjust inputs, Add clothes | Always one immediate next step |

## 3. State machine

Source: `frontend/src/studio/stateMachine.ts`

Phases: `idle` → `fineTune` → `creating` → `results` | `partial` | `failure`

Overlays (orthogonal): `none` | `tryOn` | `swap`

Key transitions:
- Invalid submit keeps `fineTune` and sets inline error.
- Valid submit enters `creating`, clears overlays.
- Success → `results`; warning with outfits → `partial`; hard error → `failure`.
- Retry re-enters `creating` with last valid inputs.
- Try-on / swap only open from `results` or `partial`.

## 4. UI → service pipeline

Source: `frontend/src/studio/eventPipeline.ts`

| UI event | Service | Success UI | Failure UI |
|----------|---------|------------|------------|
| Create outfits | `POST /api/recommend` | Result cards | RecoveryPanel failure |
| Retry | same | results/partial | failure |
| Try on | `POST /api/try-on` + poll | TryOnDrawer ready (`resultKind: generated`, or `collage` only if `acceptPreview`) | TryOnDrawer failed (`status: failed`, HTTP 200, `detail`) |
| Swap a piece | wardrobe candidates (+ optional future `/api/studio/swaps`) | Outfit card updates | Drawer inline error |
| Save look | local save + `/api/outfits` gallery | Saved badge + Looks | Inline error |
| Saved looks tab | navigate `/looks` | Gallery | Empty/error |

## 5. Recovery patterns

Source: `frontend/src/studio/recovery.ts` + `RecoveryPanel`

| Kind | Primary | Secondary |
|------|---------|-----------|
| offline | Retry connection | Open alerts |
| emptyCloset | Add clothes | — |
| failure | Retry | Adjust inputs / Open closet |
| partial | Retry missing looks | Add clothes |
| noBodyPhoto | Go to Settings | — |

Never trap users in a dead-end modal. Always expose one progressive action.

## 6. Screen-by-screen acceptance criteria

### Studio idle (`08`)
- Left plan panel visible; Create disabled until venue selected.
- Right canvas shows empty prompt: “Your next outfit starts here”.

### Fine-tune (`09`)
- Optional style + expandable fine-tune copy.
- Editing inputs emits `EDIT_INPUTS` / `OPEN_FINE_TUNE`.

### Creating (`10`)
- CTA shows elapsed seconds; skeletons on canvas; inputs disabled for style control.

### Results (`11`)
- Header shows count + elapsed.
- Cards expose Try on / Swap / Save only.

### Try-on drawer (`12`)
- States: idle → rendering → ready | failed.
- States: idle, rendering, ready-generated, ready-collage, failed.
- Ready generated: Download, Save look, Close. This is the only state that fires `studio_tryon_ready`.
- Ready collage: badge **Local preview** on the image, plus “This is a preview, not a generated try-on.” The server only returns that preview when the request set `acceptPreview: true`. Fires `studio_tryon_preview`, not `studio_tryon_ready`. The same badge is used on result cards, Looks, and the Try-On tab.
- Failed: Retry is the primary action. HTTP 200 with `status: "failed"`, `fallbackReason`, and `detail` stays in this drawer (it is not “Studio is unreachable”). `provider_error`, `timeout`, `missing_key`, `missing_inputs`, and `local_images_not_public` can offer “Show a local preview instead”, which retries with `acceptPreview: true`. See `docs/API.md`.

### Swap drawer (`13`)
- Slot chips from outfit categories.
- Candidates exclude already-used item IDs.
- Apply updates outfit items in place.

### Result states (`14`)
- Partial and failure use RecoveryPanel, not silent empty screens.

### Saved looks (`15`)
- Grid of local + API looks; Open returns to Studio with venue; Remove confirms for local.

## 7. Telemetry

Source: `frontend/src/lib/analytics.ts`

Required events:
- `studio_run_started|completed|failed|partial`
- `studio_tryon_started|ready|preview|failed` (`preview` is a collage, not a successful try-on)
- `studio_swap_opened|applied`
- `studio_look_saved`
- `studio_retry_clicked`
- `nav_tab_opened`

Success metrics:
- run completion rate
- try-on success rate
- swap apply rate
- save rate
- retry rate

## 8. Frontend checklist

- [x] Expanded sidebar IA
- [x] StudioShell Create / Saved looks tabs
- [x] State machine wired in Studio page
- [x] Outfit card action hierarchy
- [x] Try-on + swap drawers
- [x] Recovery panels
- [x] Looks / Try-On / Activity / Alerts / Settings routes
- [x] Analytics + activity/alerts stores
- [x] API contract notes in `docs/API.md`

## 9. Backend follow-ups (optional)

1. Persist explicit saved-look flag (`POST /api/looks`).
2. Add `POST /api/studio/swaps` for server-side rescoring after swap.
3. Optional async run IDs if generation becomes long-running.
4. Surface try-on queue status for the Try-On tab.
