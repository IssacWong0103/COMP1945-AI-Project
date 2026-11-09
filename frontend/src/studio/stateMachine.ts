/**
 * Studio run lifecycle state machine.
 * Source of truth for UI transitions across idle → fine-tune → creating → results.
 */

export type StudioPhase =
  | 'idle'
  | 'fineTune'
  | 'creating'
  | 'results'
  | 'partial'
  | 'failure'

export type StudioOverlay = 'none' | 'tryOn' | 'swap'

export type StudioEvent =
  | { type: 'OPEN_FINE_TUNE' }
  | { type: 'EDIT_INPUTS' }
  | { type: 'SUBMIT_VALID' }
  | { type: 'SUBMIT_INVALID' }
  | { type: 'RUN_SUCCESS'; outfitCount: number }
  | { type: 'RUN_PARTIAL'; outfitCount: number; warning: string }
  | { type: 'RUN_FAILURE'; message: string }
  | { type: 'RETRY' }
  | { type: 'RESET' }
  | { type: 'OPEN_TRY_ON'; outfitId: string }
  | { type: 'OPEN_SWAP'; outfitId: string; slot?: string }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'SAVE_LOOK'; outfitId: string }

export type StudioMachineState = {
  phase: StudioPhase
  overlay: StudioOverlay
  activeOutfitId: string | null
  activeSlot: string | null
  lastError: string | null
  lastWarning: string | null
  outfitCount: number
}

export const INITIAL_STUDIO_STATE: StudioMachineState = {
  phase: 'idle',
  overlay: 'none',
  activeOutfitId: null,
  activeSlot: null,
  lastError: null,
  lastWarning: null,
  outfitCount: 0,
}

export function reduceStudioState(
  state: StudioMachineState,
  event: StudioEvent,
): StudioMachineState {
  switch (event.type) {
    case 'OPEN_FINE_TUNE':
    case 'EDIT_INPUTS':
      return {
        ...state,
        phase: state.phase === 'creating' ? state.phase : 'fineTune',
        lastError: null,
      }
    case 'SUBMIT_INVALID':
      return {
        ...state,
        phase: 'fineTune',
        lastError: 'Select where you are going before creating outfits.',
      }
    case 'SUBMIT_VALID':
      return {
        ...state,
        phase: 'creating',
        overlay: 'none',
        activeOutfitId: null,
        activeSlot: null,
        lastError: null,
        lastWarning: null,
        outfitCount: 0,
      }
    case 'RUN_SUCCESS':
      return {
        ...state,
        phase: 'results',
        outfitCount: event.outfitCount,
        lastError: null,
        lastWarning: null,
      }
    case 'RUN_PARTIAL':
      return {
        ...state,
        phase: 'partial',
        outfitCount: event.outfitCount,
        lastWarning: event.warning,
        lastError: null,
      }
    case 'RUN_FAILURE':
      return {
        ...state,
        phase: 'failure',
        outfitCount: 0,
        lastError: event.message,
        lastWarning: null,
      }
    case 'RETRY':
      return {
        ...state,
        phase: 'creating',
        overlay: 'none',
        activeOutfitId: null,
        activeSlot: null,
        lastError: null,
      }
    case 'RESET':
      return { ...INITIAL_STUDIO_STATE }
    case 'OPEN_TRY_ON':
      if (state.phase !== 'results' && state.phase !== 'partial') return state
      return {
        ...state,
        overlay: 'tryOn',
        activeOutfitId: event.outfitId,
        activeSlot: null,
      }
    case 'OPEN_SWAP':
      if (state.phase !== 'results' && state.phase !== 'partial') return state
      return {
        ...state,
        overlay: 'swap',
        activeOutfitId: event.outfitId,
        activeSlot: event.slot ?? null,
      }
    case 'CLOSE_OVERLAY':
      return {
        ...state,
        overlay: 'none',
        activeOutfitId: null,
        activeSlot: null,
      }
    case 'SAVE_LOOK':
      return state
    default:
      return state
  }
}

export function canCreateFrom(phase: StudioPhase): boolean {
  return phase !== 'creating'
}

export function showsResultCanvas(phase: StudioPhase): boolean {
  return phase === 'results' || phase === 'partial' || phase === 'creating' || phase === 'failure'
}
