import type { SearchMode, TryOnFallbackReason, TryOnResponse, TryOnResultKind } from '../types'

export const SERVER_UNREACHABLE_TITLE = "We can't reach the USTyle server"
export const SERVER_UNREACHABLE_MESSAGE = 'Check that the app is running, then retry.'

export const CREATING_GENERIC = 'Finding looks for your day…'
export const CREATING_SEARCH = 'Searching fashion references for this venue and style…'
export const CREATING_REVIEW = 'Reviewing a shortlist of reference photos…'
export const CREATING_BUILD = 'Putting this together from your clothes…'

const FALLBACK_REASONS = new Set<TryOnFallbackReason>([
  'local_images_not_public',
  'provider_error',
  'timeout',
  'missing_key',
  'missing_inputs',
])

const PREVIEW_REASONS = new Set<TryOnFallbackReason>([
  'provider_error',
  'timeout',
  'missing_key',
  'missing_inputs',
  'local_images_not_public',
])

export function isTryOnFallbackReason(value: unknown): value is TryOnFallbackReason {
  return typeof value === 'string' && FALLBACK_REASONS.has(value as TryOnFallbackReason)
}

export function isTryOnResultKind(value: unknown): value is TryOnResultKind {
  return value === 'generated' || value === 'collage'
}

/** Strip vendor names from anything a student might read. */
export function studentFacingCopy(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/kie\.ai/gi, 'the try-on service')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export type NormalizedStyleReference = {
  id?: string
  imageUrl?: string
  label?: string
  reason?: string
}

/**
 * Accepts the branch string (`wording or id`) and a later `{ id, imageUrl, label?, reason? }`.
 * A string is never turned into an image URL.
 */
export function normalizeStyleReference(value: unknown): NormalizedStyleReference | null {
  if (typeof value === 'string') {
    const text = studentFacingCopy(value)
    if (!text) return null
    if (/\s/.test(text) || text.length > 48) return { reason: text }
    return { label: text }
  }
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const imageUrl =
    typeof record.imageUrl === 'string'
      ? record.imageUrl.trim()
      : typeof record.image_url === 'string'
        ? record.image_url.trim()
        : ''
  const label = typeof record.label === 'string' ? studentFacingCopy(record.label) : ''
  const reason = typeof record.reason === 'string' ? studentFacingCopy(record.reason) : ''
  if (!id && !imageUrl && !label && !reason) return null
  return {
    id: id || undefined,
    imageUrl: imageUrl || undefined,
    label: label || undefined,
    reason: reason || undefined,
  }
}

export function styleReferenceForOutfit(input: {
  styleReference?: unknown
  styleReferenceUrl?: string | null
}): NormalizedStyleReference | null {
  const base = normalizeStyleReference(input.styleReference)
  const extra = input.styleReferenceUrl?.trim() ?? ''
  if (!base && !extra) return null
  if (base && !base.imageUrl && extra) return { ...base, imageUrl: extra }
  if (!base && extra) return { imageUrl: extra, label: 'Style reference' }
  return base
}

const CREATING_STEPS: Record<string, string> = {
  searchingText: CREATING_SEARCH,
  reviewingPhotos: CREATING_REVIEW,
  buildingOutfits: CREATING_BUILD,
}

/**
 * Generic copy unless the catalog path is actually indicated.
 * simpleFallback and an omitted mode must not pretend text-then-photos is live.
 */
export function creatingStatusCopy(input: {
  searchMode?: SearchMode | null
  runStatus?: string | null
  elapsedSec?: number
}): string {
  const step = input.runStatus ? CREATING_STEPS[input.runStatus] : undefined
  if (step) return step
  if (input.searchMode === 'textThenPhotos') {
    const elapsed = input.elapsedSec ?? 0
    if (elapsed < 4) return CREATING_SEARCH
    if (elapsed < 8) return CREATING_REVIEW
    return CREATING_BUILD
  }
  return CREATING_GENERIC
}

export function partialResultsCopy(
  warning: string | null | undefined,
  searchMode?: SearchMode | null,
): string {
  const text = studentFacingCopy(warning)
  if (text) return text
  if (searchMode === 'simpleFallback' || searchMode === 'textThenPhotos') {
    return "Reference search didn't finish, so these outfits used a simpler match."
  }
  return 'Only some outfits were possible with your current closet.'
}

export function renderingCopy(hasStyleReference: boolean): string {
  if (hasStyleReference) {
    return 'Dressing you in your clothes, using this look as a style reference.'
  }
  return 'Dressing you in your clothes…'
}

export function collageExplanation(
  reason: TryOnFallbackReason | null | undefined,
  detail?: string | null,
): string {
  switch (reason) {
    case 'local_images_not_public':
      return "While the app is running on your computer, we can't create a generated try-on from these photos. Here's a labeled preview of you and your clothes."
    case 'provider_error':
    case 'timeout':
      return "We couldn't generate the try-on, so here's a labeled preview instead."
    case 'missing_inputs':
      return "We need a body photo and your outfit photos to generate a try-on. Here's a preview with what we have."
    case 'missing_key':
      return "Try-on isn't available right now, so here's a labeled preview instead."
    default: {
      const safe = studentFacingCopy(detail)
      return safe || 'This is a preview, not a generated try-on.'
    }
  }
}

export function tryOnFailureCopy(
  reason: TryOnFallbackReason | null | undefined,
  detail?: string | null,
): { title: string; message: string } {
  const safe = studentFacingCopy(detail)
  switch (reason) {
    case 'provider_error':
    case 'timeout':
      return {
        title: "The try-on didn't finish.",
        message: safe || "It's safe to try again.",
      }
    case 'missing_key':
      return {
        title: "Try-on isn't available right now.",
        message: safe || 'Retry after it is set up, or show a local preview instead.',
      }
    case 'local_images_not_public':
      return {
        title: "We can't create a generated try-on from these photos while the app is on your computer.",
        message: safe || 'Retry once the photos are reachable, or show a local preview instead.',
      }
    case 'missing_inputs':
      return {
        title: 'We need a body photo and your outfit photos to generate a try-on.',
        message: safe || 'Retry after those are in place, or show a local preview instead.',
      }
    default:
      return {
        title: "The try-on didn't finish.",
        message: safe || "It's safe to try again.",
      }
  }
}

/** Secondary drawer action. Never the automatic result for these reasons. */
export function offersLocalPreview(reason: TryOnFallbackReason | null | undefined): boolean {
  return reason != null && PREVIEW_REASONS.has(reason)
}

export function tryOnResultEvent(
  kind: TryOnResultKind | null | undefined,
): 'studio_tryon_ready' | 'studio_tryon_preview' | null {
  if (kind === 'generated') return 'studio_tryon_ready'
  if (kind === 'collage') return 'studio_tryon_preview'
  return null
}

export type TryOnPollDecision =
  | { type: 'ready' }
  | { type: 'poll' }
  | {
      type: 'failed'
      httpStatus: number
      message: string
      fallbackReason: TryOnFallbackReason | null
      offerPreview: boolean
    }

const UNUSABLE_IMAGE =
  'The try-on finished but no usable image came back. Retry, or show a local preview instead.'
const COLLAGE_NOT_SUCCESS =
  'This image is a local preview, not a generated try-on. Retry, or show a local preview instead.'

/**
 * Map one try-on body onto the next client step.
 * HTTP 200 + status failed stays a failure (it is not a 5xx and not a collage).
 * A collage is ready only when this call set acceptPreview.
 */
export function interpretTryOnBody(
  result: Pick<TryOnResponse, 'status' | 'tryOnUrl' | 'resultKind' | 'fallbackReason' | 'detail'>,
  options?: { acceptPreview?: boolean },
): TryOnPollDecision {
  const fallbackReason = isTryOnFallbackReason(result.fallbackReason) ? result.fallbackReason : null
  if (result.status === 'ready') {
    const kind = result.resultKind
    const url = result.tryOnUrl?.trim()
    if (!url || (kind !== 'generated' && kind !== 'collage')) {
      return {
        type: 'failed',
        httpStatus: 200,
        message: studentFacingCopy(result.detail) || UNUSABLE_IMAGE,
        fallbackReason,
        offerPreview: offersLocalPreview(fallbackReason),
      }
    }
    if (kind === 'collage' && !options?.acceptPreview) {
      return {
        type: 'failed',
        httpStatus: 200,
        message: studentFacingCopy(result.detail) || COLLAGE_NOT_SUCCESS,
        fallbackReason,
        offerPreview: true,
      }
    }
    return { type: 'ready' }
  }
  if (result.status === 'processing') return { type: 'poll' }
  const copy = tryOnFailureCopy(fallbackReason, result.detail)
  return {
    type: 'failed',
    httpStatus: 200,
    message: copy.message,
    fallbackReason,
    offerPreview: offersLocalPreview(fallbackReason),
  }
}

export type ApiRecoveryContext = {
  source?: 'recommend' | 'tryon' | 'connection'
  fallbackReason?: TryOnFallbackReason | null
  tryOnStatus?: TryOnResponse['status'] | null
  resultKind?: TryOnResultKind | null
}

export type ApiRecoveryCopy = {
  kind: 'offline' | 'failure'
  title: string
  message: string
  primaryLabel: string
  secondary?: { id: 'adjust' | 'openAlerts'; label: string; to?: string }
}

function isGenericServerDetail(detail: string): boolean {
  const text = detail.trim().toLowerCase()
  if (!text) return true
  return (
    text.startsWith('something went sideways') ||
    text.includes('styling studio had a moment') ||
    text === 'internal server error' ||
    text === 'bad gateway' ||
    text === 'service unavailable' ||
    text === 'gateway timeout' ||
    text === 'bad request'
  )
}

function hasProviderSignal(detail: string, context?: ApiRecoveryContext): boolean {
  if (isTryOnFallbackReason(context?.fallbackReason)) return true
  if (context?.tryOnStatus === 'failed') return true
  if (context?.resultKind === 'collage') return true
  return /try-on provider|provider could not|provider timed|provider returned|local preview/i.test(detail)
}

function isUnreachable(status: number, detail: string, context?: ApiRecoveryContext): boolean {
  if (hasProviderSignal(detail, context)) return false
  if (context?.source === 'connection' || status === 0) return true
  return /backend not running|failed to fetch|networkerror|network error|econnrefused|load failed/i.test(
    detail,
  )
}

/**
 * Recommend / connection recovery. A try-on body with status failed is not
 * "Studio is unreachable", even if an older client treated HTTP 502 that way.
 */
export function recoveryCopyForApiError(
  status: number,
  detail: string,
  context?: ApiRecoveryContext,
): ApiRecoveryCopy {
  const safe = studentFacingCopy(detail)
  const reason = isTryOnFallbackReason(context?.fallbackReason) ? context?.fallbackReason : null

  if (isUnreachable(status, safe, context)) {
    return {
      kind: 'offline',
      title: SERVER_UNREACHABLE_TITLE,
      message: SERVER_UNREACHABLE_MESSAGE,
      primaryLabel: 'Retry connection',
      secondary: { id: 'openAlerts', label: 'Open alerts', to: '/alerts' },
    }
  }

  if (context?.tryOnStatus === 'failed' || (status === 200 && reason)) {
    const copy = tryOnFailureCopy(reason, safe)
    return {
      kind: 'failure',
      title: copy.title,
      message: copy.message,
      primaryLabel: 'Retry',
    }
  }

  if (reason) {
    const copy = tryOnFailureCopy(reason, safe)
    return {
      kind: 'failure',
      title: copy.title,
      message: copy.message,
      primaryLabel: 'Retry',
    }
  }

  if (status === 400 || status === 422) {
    return {
      kind: 'failure',
      title: 'Check those inputs',
      message: safe || 'That request didn’t look right. Adjust the fields and try again.',
      primaryLabel: 'Retry',
      secondary: { id: 'adjust', label: 'Adjust inputs' },
    }
  }

  if (status >= 500) {
    const provider = hasProviderSignal(safe, context)
    if (context?.source === 'tryon' || provider) {
      return {
        kind: 'failure',
        title: provider ? "The try-on didn't finish." : 'The USTyle server had a problem.',
        message: provider
          ? safe && !isGenericServerDetail(safe)
            ? safe
            : "It's safe to try again."
          : 'It’s safe to try again in a moment.',
        primaryLabel: 'Retry',
        secondary: provider ? undefined : { id: 'openAlerts', label: 'Open alerts', to: '/alerts' },
      }
    }
    return {
      kind: 'failure',
      title: "Couldn't create outfits",
      message:
        safe && !isGenericServerDetail(safe)
          ? safe
          : "We couldn't search fashion references. Your clothes are unchanged.",
      primaryLabel: 'Retry',
      secondary: { id: 'adjust', label: 'Adjust inputs' },
    }
  }

  return {
    kind: 'failure',
    title: "Couldn't create outfits",
    message: safe || 'Generation failed. Adjust your plan or try again.',
    primaryLabel: 'Retry',
    secondary: { id: 'adjust', label: 'Adjust inputs' },
  }
}
