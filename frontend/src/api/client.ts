import type {
  HealthResponse,
  Profile,
  RecommendRequest,
  RecommendResponse,
  TryOnResponse,
  VenueInfo,
  WardrobeItem,
} from '../types'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
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

async function readDetail(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown }
    if (typeof data.detail === 'string' && data.detail.trim()) {
      const detail = data.detail.trim()
      if (GENERIC_DETAILS.has(detail)) return campusFallback(res.status)
      return detail
    }
  } catch {
    /* empty or non-JSON body */
  }
  return campusFallback(res.status)
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
  if (!res.ok) throw new ApiError(await readDetail(res), res.status)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function friendlyError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'Cancelled.'
  if (err instanceof ApiError) return err.message
  if (err instanceof TypeError) {
    return 'Backend not running on port 8018. Start the USTyle API, then try again.'
  }
  if (err instanceof Error && err.message) return err.message
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
  if (!res.ok) throw new ApiError(await readDetail(res), res.status)
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
  if (input.heightCm != null && !Number.isNaN(input.heightCm)) {
    body.append('heightCm', String(input.heightCm))
  }
  if (input.weightKg != null && !Number.isNaN(input.weightKg)) {
    body.append('weightKg', String(input.weightKg))
  }
  if (input.gender) body.append('gender', input.gender)
  if (input.skinTone) body.append('skinTone', input.skinTone)
  if (input.preferredStyle) body.append('preferredStyle', input.preferredStyle)

  const res = await fetch('/api/profile', { method: 'PUT', body })
  return parseJson<Profile>(res)
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
): Promise<TryOnResponse> {
  const res = await fetch('/api/try-on', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outfitId }),
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
  options?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<TryOnResponse> {
  const intervalMs = options?.intervalMs ?? 2000
  const timeoutMs = options?.timeoutMs ?? 90_000
  const signal = options?.signal
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const result = await tryOn(outfitId, signal)
    if (result.status === 'ready') {
      if (!result.tryOnUrl) {
        throw new ApiError(
          'The try-on finished but no image came back. Try another look.',
          502,
        )
      }
      return result
    }
    if (result.status !== 'processing') {
      throw new ApiError('The try-on studio returned an unexpected status. Try again.', 502)
    }
    if (Date.now() >= deadline) {
      throw new ApiError(
        'Still rendering after a minute and a half. Give it another go — campus Wi-Fi happens.',
        408,
      )
    }
    await delay(intervalMs, signal)
  }
}
