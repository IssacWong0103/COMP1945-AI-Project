/**
 * Single action-placement system for Studio screens.
 * One primary CTA per panel. Destructive actions require confirm/undo.
 */

export type ActionZone =
  | 'topGlobal'
  | 'leftPanel'
  | 'resultCardPrimary'
  | 'resultCardSecondary'
  | 'drawerFooter'
  | 'recovery'

export type StudioActionId =
  | 'createOutfits'
  | 'openSavedLooks'
  | 'retryRun'
  | 'adjustInputs'
  | 'tryOn'
  | 'swapPiece'
  | 'saveLook'
  | 'downloadImage'
  | 'closeDrawer'
  | 'retryTryOn'
  | 'removeLook'
  | 'addClothes'

export type StudioActionSpec = {
  id: StudioActionId
  label: string
  zone: ActionZone
  variant: 'primary' | 'secondary' | 'ghost' | 'danger'
  destructive?: boolean
  requiresConfirm?: boolean
}

/** Canonical placement map — do not duplicate primaries across zones. */
export const STUDIO_ACTIONS: Record<StudioActionId, StudioActionSpec> = {
  createOutfits: {
    id: 'createOutfits',
    label: 'Create outfits',
    zone: 'leftPanel',
    variant: 'primary',
  },
  openSavedLooks: {
    id: 'openSavedLooks',
    label: 'Saved looks',
    zone: 'topGlobal',
    variant: 'secondary',
  },
  retryRun: {
    id: 'retryRun',
    label: 'Retry',
    zone: 'recovery',
    variant: 'primary',
  },
  adjustInputs: {
    id: 'adjustInputs',
    label: 'Adjust inputs',
    zone: 'recovery',
    variant: 'secondary',
  },
  tryOn: {
    id: 'tryOn',
    label: 'Try on',
    zone: 'resultCardPrimary',
    variant: 'primary',
  },
  swapPiece: {
    id: 'swapPiece',
    label: 'Swap a piece',
    zone: 'resultCardPrimary',
    variant: 'secondary',
  },
  saveLook: {
    id: 'saveLook',
    label: 'Save look',
    zone: 'resultCardPrimary',
    variant: 'secondary',
  },
  downloadImage: {
    id: 'downloadImage',
    label: 'Download image',
    zone: 'resultCardSecondary',
    variant: 'secondary',
  },
  closeDrawer: {
    id: 'closeDrawer',
    label: 'Close',
    zone: 'drawerFooter',
    variant: 'ghost',
  },
  retryTryOn: {
    id: 'retryTryOn',
    label: 'Retry',
    zone: 'drawerFooter',
    variant: 'primary',
  },
  removeLook: {
    id: 'removeLook',
    label: 'Remove',
    zone: 'resultCardSecondary',
    variant: 'danger',
    destructive: true,
    requiresConfirm: true,
  },
  addClothes: {
    id: 'addClothes',
    label: 'Add clothes',
    zone: 'recovery',
    variant: 'primary',
  },
}

export const TOP_GLOBAL_TABS = [
  { id: 'create' as const, label: 'Create', path: '/studio' },
  { id: 'saved' as const, label: 'Saved looks', path: '/looks' },
]

export function actionsForZone(zone: ActionZone): StudioActionSpec[] {
  return Object.values(STUDIO_ACTIONS).filter((action) => action.zone === zone)
}

export function primaryCtaLabel(busy: boolean, elapsedSec: number): string {
  if (busy) return `Creating… ${elapsedSec.toFixed(0)}s`
  return STUDIO_ACTIONS.createOutfits.label
}
