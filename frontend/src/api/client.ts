import {
  interpretTryOnBody,
  isTryOnFallbackReason,
  isTryOnResultKind,
  studentFacingCopy,
} from '../studio/studioCopy'
import type {
  HealthResponse,
  Profile,
  RecommendRequest,
  RecommendResponse,
  SavedLook,
  TryOnFallbackReason,
  TryOnRequest,
  TryOnResponse,
  TryOnResultKind,
  VenueInfo,
  WardrobeItem,
} from '../types'

export class ApiError extends Error {
  status: number
  fallbackReason: TryOnFallbackReason | null
  tryOnStatus: TryOnResponse['status'] | null
  resultKind: TryOnResultKind | null

  constructor(
    message: string,
    status: number,
    extra?: {
      fallbackReason?: TryOnFallbackReason | null
      tryOnStatus?: TryOnResponse['status'] | null
      resultKind?: TryOnResultKind | null
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fallbackReason = extra?.fallbackReason ?? null
    this.tryOnStatus = extra?.tryOnStatus ?? null
    this.resultKind = extra?.resultKind ?? null
  }
}

/** HTTP 200 try-on failure, or a client poll that ended without a generated image. */
export class TryOnRequestError extends ApiError {
  offerPreview: boolean

  constructor(
    message: string,
    status: number,
    extra?: {
      fallbackReason?: TryOnFallbackReason | null
      tryOnStatus?: TryOnResponse['status'] | null
      resultKind?: TryOnResultKind | null
      offerPreview?: boolean
    },
  ) {
    super(message, status, extra)
    this.name = 'TryOnRequestError'
    this.offerPreview = extra?.offerPreview ?? false
  }
}

export function apiUrl(imageUrl: string): string {
  if (!imageUrl) return ''
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl
  return imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`
}

const GENERIC_DETAILS = new Set([
  'Not Found',
  'Internal Server Error',
  'Method Not Allowed',
  'Bad Request',
])

type ErrorPayload = {
  detail: string
  fallbackReason: TryOnFallbackReason | null
  tryOnStatus: TryOnResponse['status'] | null
  resultKind: TryOnResultKind | null
}

async function readErrorPayload(res: Response): Promise<ErrorPayload> {
  try {
    const data = (await res.json()) as Record<string, unknown>
    const fallbackReason = isTryOnFallbackReason(data.fallbackReason) ? data.fallbackReason : null
    const tryOnStatus =
      data.status === 'ready' || data.status === 'processing' || data.status === 'failed'
        ? data.status
        : null
    const resultKind = isTryOnResultKind(data.resultKind) ? data.resultKind : null
    let detail = ''
    if (typeof data.detail === 'string' && data.detail.trim()) {
      const text = data.detail.trim()
      if (!GENERIC_DETAILS.has(text)) detail = text
    }
    return {
      detail: studentFacingCopy(detail) || campusFallback(res.status),
      fallbackReason,
      tryOnStatus,
      resultKind,
    }
  } catch {
    return {
      detail: campusFallback(res.status),
      fallbackReason: null,
      tryOnStatus: null,
      resultKind: null,
    }
  }
}

function errorFromResponse(res: Response, payload: ErrorPayload): ApiError {
  return new ApiError(payload.detail, res.status, {
    fallbackReason: payload.fallbackReason,
    tryOnStatus: payload.tryOnStatus,
    resultKind: payload.resultKind,
  })
}

function campusFallback(status: number): string {
  if (status === 400) return 'That request didn’t look right. Check the photo or fields and try again.'
  if (status === 404 || status === 405) {
    return 'That closet door isn’t on the server yet. Check the backend is running the shared API.'
  }
  if (status === 413) return 'That photo is a bit heavy. Try a smaller JPEG, PNG, or WebP.'
  if (status === 415) return 'We only take JPEG, PNG, or WebP — campus printers have rules; so do we.'
  if (status === 502) return 'The styling studio had a moment. Give it another go.'
  return `Something went sideways (${status}). Try again in a moment.`
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw errorFromResponse(res, await readErrorPayload(res))
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function friendlyError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'Cancelled.'
  if (err instanceof ApiError) return studentFacingCopy(err.message)
  if (err instanceof TypeError) {
    return 'Backend not running on port 8018. Start the USTyle API, then try again.'
  }
  if (err instanceof Error && err.message) return studentFacingCopy(err.message)
  return 'Something went sideways. Try again in a moment.'
}

export async function getHealth(): Promise<HealthResponse> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 2500)
  try {
    const res = await fetch('/api/health', { signal: ctrl.signal })
    return parseJson<HealthResponse>(res)
  } finally {
    window.clearTimeout(timer)
  }
}

export async function getVenues(): Promise<VenueInfo[]> {
  const res = await fetch('/api/venues')
  const data = await parseJson<{ venues: VenueInfo[] }>(res)
  return data.venues
}

export async function listWardrobeItems(): Promise<WardrobeItem[]> {
  const res = await fetch('/api/wardrobe/items')
  const data = await parseJson<{ items: WardrobeItem[] }>(res)
  return data.items
}

export async function uploadWardrobeItem(file: File, notes?: string): Promise<WardrobeItem> {
  const body = new FormData()
  body.append('file', file)
  if (notes) body.append('notes', notes)
  const res = await fetch('/api/wardrobe/items', { method: 'POST', body })
  return parseJson<WardrobeItem>(res)
}

export async function updateWardrobeItem(
  id: string,
  patch: {
    category?: string
    color?: string
    cut?: string
    style?: string
    description?: string
    itemGender?: string
  },
): Promise<WardrobeItem> {
  const res = await fetch(`/api/wardrobe/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return parseJson<WardrobeItem>(res)
}

export async function deleteWardrobeItem(id: string): Promise<void> {
  const res = await fetch(`/api/wardrobe/items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw errorFromResponse(res, await readErrorPayload(res))
}

export async function getProfile(): Promise<Profile> {
  const res = await fetch('/api/profile')
  return parseJson<Profile>(res)
}

export async function updateProfile(input: {
  file?: File | null
  heightCm?: number | null
  weightKg?: number | null
  gender?: string | null
  skinTone?: string | null
  preferredStyle?: string | null
}): Promise<Profile> {
  const body = new FormData()
  if (input.file) body.append('file', input.file)
  body.append(
    'heightCm',
    input.heightCm != null && !Number.isNaN(input.heightCm) ? String(input.heightCm) : '',
  )
  body.append(
    'weightKg',
    input.weightKg != null && !Number.isNaN(input.weightKg) ? String(input.weightKg) : '',
  )
  body.append('gender', input.gender ?? '')
  body.append('skinTone', input.skinTone ?? '')
  body.append('preferredStyle', input.preferredStyle ?? '')

  const res = await fetch('/api/profile', { method: 'PUT', body })
  return parseJson<Profile>(res)
}

export async function listSavedLooks(): Promise<SavedLook[]> {
  const res = await fetch('/api/outfits')
  const data = await parseJson<{ looks: SavedLook[] }>(res)
  return data.looks
}

export async function recommend(payload: RecommendRequest): Promise<RecommendResponse> {
  const res = await fetch('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson<RecommendResponse>(res)
}

export async function tryOn(
  outfitId: string,
  signal?: AbortSignal,
  options?: { acceptPreview?: boolean },
): Promise<TryOnResponse> {
  const body: TryOnRequest = { outfitId }
  if (options?.acceptPreview) body.acceptPreview = true
  const res = await fetch('/api/try-on', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return parseJson<TryOnResponse>(res)
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(), ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function pollTryOn(
  outfitId: string,
  options?: {
    intervalMs?: number
    timeoutMs?: number
    signal?: AbortSignal
    acceptPreview?: boolean
  },
): Promise<TryOnResponse> {
  const intervalMs = options?.intervalMs ?? 2000
  const timeoutMs = options?.timeoutMs ?? 90_000
  const signal = options?.signal
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const result = await tryOn(outfitId, signal, { acceptPreview: options?.acceptPreview })
    const decision = interpretTryOnBody(result, { acceptPreview: options?.acceptPreview })
    if (decision.type === 'ready') return result
    if (decision.type === 'failed') {
      throw new TryOnRequestError(decision.message, decision.httpStatus, {
        fallbackReason: decision.fallbackReason,
        tryOnStatus: 'failed',
        resultKind: isTryOnResultKind(result.resultKind) ? result.resultKind : null,
        offerPreview: decision.offerPreview,
      })
    }
    if (Date.now() >= deadline) {
      throw new TryOnRequestError(
        'Still working after a minute and a half. It’s safe to try again.',
        408,
        {
          fallbackReason: 'timeout',
          tryOnStatus: 'failed',
          resultKind: null,
          offerPreview: true,
        },
      )
    }
    await delay(intervalMs, signal)
  }
}
