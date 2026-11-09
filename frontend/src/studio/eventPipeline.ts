/**
 * UI event → service → state transition → UI response map.
 * Keep this aligned with docs/STUDIO_ENGINEERING_SPEC.md.
 */

export type PipelineStep = {
  uiEvent: string
  trigger: string
  service: string
  request: string
  onSuccess: string
  onFailure: string
  analytics: string
}

export const STUDIO_EVENT_PIPELINE: PipelineStep[] = [
  {
    uiEvent: 'Create outfits',
    trigger: 'Left panel primary CTA',
    service: 'POST /api/recommend (run create)',
    request: '{ venue, preferredStyle? }',
    onSuccess: 'phase → results|partial; render outfit cards',
    onFailure: 'phase → failure; show RecoveryPanel',
    analytics: 'studio_run_started → studio_run_completed|failed|partial',
  },
  {
    uiEvent: 'Retry / Retry missing looks',
    trigger: 'Recovery primary',
    service: 'POST /api/recommend',
    request: 'Same last valid input bundle',
    onSuccess: 'phase → results|partial',
    onFailure: 'phase → failure',
    analytics: 'studio_retry_clicked + run events',
  },
  {
    uiEvent: 'Try on',
    trigger: 'Result card primary',
    service: 'POST /api/try-on + poll',
    request: '{ outfitId, acceptPreview? }',
    onSuccess: 'ready-generated, or ready-collage only when acceptPreview was set',
    onFailure: 'drawer failed (HTTP 200 status failed keeps fallbackReason + detail)',
    analytics: 'studio_tryon_started → studio_tryon_ready | studio_tryon_preview | studio_tryon_failed',
  },
  {
    uiEvent: 'Swap a piece',
    trigger: 'Result card secondary',
    service: 'Client swap candidates from GET /api/wardrobe/items; optional POST /api/studio/swaps',
    request: '{ outfitId, slot, replacementItemId }',
    onSuccess: 'Update outfit.items in place; keep phase',
    onFailure: 'Inline error in swap drawer',
    analytics: 'studio_swap_opened → studio_swap_applied',
  },
  {
    uiEvent: 'Save look',
    trigger: 'Result card / try-on ready',
    service: 'Local save + GET /api/outfits gallery',
    request: '{ outfitId, venue, scores, items }',
    onSuccess: 'Toast + Activity entry; available in Looks',
    onFailure: 'Inline error',
    analytics: 'studio_look_saved',
  },
  {
    uiEvent: 'Saved looks tab',
    trigger: 'Top global',
    service: 'GET /api/outfits + local saved looks',
    request: 'none',
    onSuccess: 'Navigate /looks',
    onFailure: 'Empty/error state on Looks page',
    analytics: 'nav_tab_opened',
  },
]

export function pipelineFor(uiEvent: string): PipelineStep | undefined {
  return STUDIO_EVENT_PIPELINE.find((step) => step.uiEvent === uiEvent)
}
