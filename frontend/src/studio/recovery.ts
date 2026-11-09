/**
 * Standardized recovery UX for partial / failure / offline Studio states.
 */

import {
  recoveryCopyForApiError,
  SERVER_UNREACHABLE_MESSAGE,
  SERVER_UNREACHABLE_TITLE,
  type ApiRecoveryContext,
} from './studioCopy'

export type { ApiRecoveryContext }

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
      title: SERVER_UNREACHABLE_TITLE,
      message: SERVER_UNREACHABLE_MESSAGE,
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
      message: 'Matching still works. Add a photo in Settings to unlock virtual try-on.',
      primary: { id: 'openSettings', label: 'Go to Settings', to: '/settings' },
    }
  }

  return null
}

export function mapApiErrorToRecovery(
  status: number,
  detail: string,
  context?: ApiRecoveryContext,
): RecoverySpec {
  const copy = recoveryCopyForApiError(status, detail, context)
  return {
    kind: copy.kind,
    title: copy.title,
    message: copy.message,
    primary: { id: 'retry', label: copy.primaryLabel },
    secondary: copy.secondary
      ? { id: copy.secondary.id, label: copy.secondary.label, to: copy.secondary.to }
      : undefined,
  }
}
