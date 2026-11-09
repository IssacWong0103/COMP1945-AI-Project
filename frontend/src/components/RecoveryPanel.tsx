import { Link } from 'react-router-dom'
import type { RecoverySpec } from '../studio/recovery'
import { Button } from './Button'

type Props = {
  recovery: RecoverySpec
  onRetry?: () => void
  onAdjust?: () => void
}

export function RecoveryPanel({ recovery, onRetry, onAdjust }: Props) {
  const tone =
    recovery.kind === 'failure' || recovery.kind === 'offline'
      ? 'border-red-200 bg-red-50 text-red-950'
      : recovery.kind === 'partial' || recovery.kind === 'noBodyPhoto'
        ? 'border-amber-200 bg-amber-50 text-amber-950'
        : 'border-line bg-surface text-ink'

  function renderAction(
    action: RecoverySpec['primary'],
    variant: 'primary' | 'secondary',
  ) {
    if (action.id === 'retry' && onRetry) {
      return (
        <Button type="button" variant={variant} onClick={onRetry}>
          {action.label}
        </Button>
      )
    }
    if (action.id === 'adjust' && onAdjust) {
      return (
        <Button type="button" variant={variant} onClick={onAdjust}>
          {action.label}
        </Button>
      )
    }
    if (action.to) {
      return (
        <Link
          to={action.to}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold no-underline ${
            variant === 'primary'
              ? 'bg-navy text-white hover:bg-navy-deep'
              : 'border border-line bg-surface text-ink hover:bg-canvas'
          }`}
        >
          {action.label}
        </Link>
      )
    }
    return null
  }

  return (
    <div className={`rounded-xl border px-4 py-4 ${tone}`}>
      <p className="text-sm font-semibold">{recovery.title}</p>
      <p className="mt-1 text-sm opacity-90">{recovery.message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {renderAction(recovery.primary, 'primary')}
        {recovery.secondary ? renderAction(recovery.secondary, 'secondary') : null}
      </div>
    </div>
  )
}
