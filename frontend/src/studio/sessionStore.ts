import type { Outfit } from '../types'
import type { StudioMachineState } from './stateMachine'

const SESSION_KEY = 'ustyle.studioSession.v1'

export type StudioSessionSnapshot = {
  venue: string
  styleOverride: string
  weather: string
  timeOfDay: string
  fineTune: string
  outfits: Outfit[] | null
  machine: StudioMachineState
  elapsedMs: number | null
  feedbackText: string
  feedbackHistory: { id: string; text: string }[]
  tryOnOutfitId: string
  tryOnVenue: string
}

function sanitizeSnapshot(raw: Partial<StudioSessionSnapshot> | null): StudioSessionSnapshot | null {
  if (!raw) return null

  const outfits =
    Array.isArray(raw.outfits) && raw.outfits.length > 0 ? (raw.outfits as Outfit[]) : null

  let phase = raw.machine?.phase ?? 'idle'
  if (!outfits) {
    phase = phase === 'failure' ? 'failure' : 'idle'
  } else if (phase !== 'results' && phase !== 'partial') {
    phase = 'results'
  }

  const machine: StudioMachineState = {
    phase,
    overlay: 'none',
    activeOutfitId: null,
    activeSlot: null,
    lastError: phase === 'failure' ? (raw.machine?.lastError ?? null) : null,
    lastWarning: phase === 'partial' ? (raw.machine?.lastWarning ?? null) : null,
    outfitCount: outfits?.length ?? 0,
  }

  return {
    venue: raw.venue ?? '',
    styleOverride: raw.styleOverride ?? '',
    weather: raw.weather ?? '',
    timeOfDay: raw.timeOfDay ?? '',
    fineTune: raw.fineTune ?? '',
    outfits,
    machine,
    elapsedMs: typeof raw.elapsedMs === 'number' ? raw.elapsedMs : null,
    feedbackText: raw.feedbackText ?? '',
    feedbackHistory: Array.isArray(raw.feedbackHistory)
      ? raw.feedbackHistory.filter(
          (entry): entry is { id: string; text: string } =>
            Boolean(entry) && typeof entry.id === 'string' && typeof entry.text === 'string',
        )
      : [],
    tryOnOutfitId: typeof raw.tryOnOutfitId === 'string' ? raw.tryOnOutfitId : '',
    tryOnVenue: typeof raw.tryOnVenue === 'string' ? raw.tryOnVenue : '',
  }
}

export function loadStudioSession(): StudioSessionSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return sanitizeSnapshot(JSON.parse(raw) as Partial<StudioSessionSnapshot>)
  } catch {
    return null
  }
}

export function saveStudioSession(snapshot: StudioSessionSnapshot) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot))
  } catch {
    // Storage can be unavailable in private browsing; persistence is best effort.
  }
}

export function updateStudioSession(patch: Partial<StudioSessionSnapshot>) {
  const snapshot = loadStudioSession()
  if (!snapshot) return
  saveStudioSession({ ...snapshot, ...patch })
}

export function clearStudioSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore.
  }
}
