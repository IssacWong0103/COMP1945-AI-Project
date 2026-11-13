/**
 * Standardized recovery UX for partial / failure / offline Studio states.
 */

export type RecoveryKind = 'success' | 'partial' | 'failure' | 'offline' | 'emptyCloset' | 'noBodyPhoto'

export type RecoveryAction = {
  id: 'retry' | 'adjust' | 'openCloset' | 'openSettings' | 'openAlerts'
  label: string
  to?: string
}

export type RecoverySpec = {
  kind: RecoveryKind
  title: string
  message: string
  primary: RecoveryAction
  secondary?: RecoveryAction
}

export function resolveRecovery(input: {
  offline?: boolean
  phase?: 'partial' | 'failure' | 'results' | 'idle'
  warning?: string | null
  error?: string | null
  outfitCount?: number
  closetCount?: number
  hasBodyPhoto?: boolean | null
}): RecoverySpec | null {
  if (input.offline) {
    return {
      kind: 'offline',
      title: "We can't reach the USTyle server",
      message: 'Check that the API is running, then retry. Your closet edits stay local until reconnect.',
      primary: { id: 'retry', label: 'Retry connection' },
      secondary: { id: 'openAlerts', label: 'Open alerts', to: '/alerts' },
    }
  }

  if (input.closetCount != null && input.closetCount < 2) {
    return {
      kind: 'emptyCloset',
      title: 'Not enough clothes yet',
      message: 'Add at least two pieces so Studio can build full outfits.',
      primary: { id: 'openCloset', label: 'Add clothes', to: '/wardrobe' },
    }
  }

  if (input.phase === 'failure' || input.error) {
    return {
      kind: 'failure',
      title: "Couldn't create outfits",
      message: input.error || 'Generation failed. Adjust your plan or try again.',
      primary: { id: 'retry', label: 'Retry' },
      secondary: { id: 'adjust', label: 'Adjust inputs' },
    }
  }

  if (input.phase === 'partial' || (input.warning && (input.outfitCount ?? 0) > 0)) {
    return {
      kind: 'partial',
      title: 'Partial results',
      message: input.warning || 'Only some outfits were possible with your current closet.',
      primary: { id: 'retry', label: 'Retry missing looks' },
      secondary: { id: 'openCloset', label: 'Add clothes', to: '/wardrobe' },
    }
  }

  if (input.hasBodyPhoto === false) {
    return {
      kind: 'noBodyPhoto',
      title: 'Try-on needs a full-body photo',
      message: 'Matching still works. Add a photo in Profile to unlock virtual try-on.',
      primary: { id: 'openSettings', label: 'Go to Profile', to: '/settings' },
    }
  }

  return null
}

export function mapApiErrorToRecovery(status: number, detail: string): RecoverySpec {
  if (status === 0 || status === 502) {
    return {
      kind: 'offline',
      title: 'Studio is unreachable',
      message: detail || 'The styling studio had a moment. Give it another go.',
      primary: { id: 'retry', label: 'Retry' },
      secondary: { id: 'openAlerts', label: 'Open alerts', to: '/alerts' },
    }
  }
  return {
    kind: 'failure',
    title: "Couldn't create outfits",
    message: detail,
    primary: { id: 'retry', label: 'Retry' },
    secondary: { id: 'adjust', label: 'Adjust inputs' },
  }
}
