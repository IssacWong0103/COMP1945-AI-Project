import { Link } from 'react-router-dom'
import { apiUrl } from '../api/client'
import type { Outfit } from '../types'
import { Button } from './Button'
import { Spinner } from './Spinner'

export type TryOnDrawerStatus = 'idle' | 'rendering' | 'ready' | 'failed'

type Props = {
  outfit: Outfit
  status: TryOnDrawerStatus
  elapsedSec: number
  tryOnUrl: string | null
  error: string | null
  beforeUrl?: string | null
  hasBodyPhoto: boolean
  saved?: boolean
  onStart: () => void
  onRetry: () => void
  onSave: () => void
  onUnsave?: () => void
  onClose: () => void
}

export function TryOnDrawer({
  outfit,
  status,
  elapsedSec,
  tryOnUrl,
  error,
  beforeUrl,
  hasBodyPhoto,
  saved,
  onStart,
  onRetry,
  onSave,
  onUnsave,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tryon-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h3 id="tryon-title" className="text-sm font-semibold text-ink">
              Try on · Outfit
            </h3>
            <p className="text-xs text-muted">{(outfit.overallScore * 100).toFixed(0)}% match</p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="relative bg-canvas">
          {status === 'ready' && tryOnUrl ? (
            <img
              src={apiUrl(tryOnUrl)}
              alt="Virtual try-on result"
              className="aspect-[3/4] w-full object-cover"
            />
          ) : beforeUrl ? (
            <img
              src={apiUrl(beforeUrl)}
              alt="Body photo before try-on"
              className="aspect-[3/4] w-full object-cover opacity-90"
            />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center text-sm text-muted">
              Add a full-body photo to see yourself in this outfit.
            </div>
          )}

          {status === 'rendering' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/45 px-6 text-center text-white">
              <Spinner label="" />
              <p className="mt-3 text-sm font-semibold">{elapsedSec.toFixed(0)}s elapsed</p>
              <p className="mt-1 text-xs text-white/80">
                Dressing you in this outfit… You can keep browsing.
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 p-4">
          {status === 'idle' ? (
            <>
              <ul className="space-y-1.5 text-xs text-muted">
                <CheckRow ok={hasBodyPhoto} label="Full-body photo" />
                <CheckRow ok={outfit.items.length >= 2} label="Outfit pieces ready" />
              </ul>
              {hasBodyPhoto ? (
                <Button type="button" className="w-full" onClick={onStart}>
                  Start try-on
                </Button>
              ) : (
                <Link
                  to="/settings"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-navy px-3.5 py-2 text-sm font-semibold text-white no-underline"
                >
                  Add a full-body photo in Settings
                </Link>
              )}
              <p className="text-xs text-muted">Usually under a minute and a half.</p>
            </>
          ) : null}

          {status === 'rendering' ? (
            <Button type="button" className="w-full" disabled>
              Rendering… {elapsedSec.toFixed(0)}s
            </Button>
          ) : null}

          {status === 'ready' ? (
            <div className="flex flex-wrap gap-2">
              {tryOnUrl ? (
                <a
                  href={apiUrl(tryOnUrl)}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink no-underline hover:bg-canvas"
                >
                  Download image
                </a>
              ) : null}
              {saved && onUnsave ? (
                <Button type="button" variant="secondary" onClick={onUnsave}>
                  Unsave
                </Button>
              ) : (
                <Button type="button" variant="secondary" onClick={onSave}>
                  Save look
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : null}

          {status === 'failed' ? (
            <>
              <p className="text-sm text-danger">
                {error || "The try-on didn't finish. It's safe to try again."}
              </p>
              <Button type="button" className="w-full" onClick={onRetry}>
                Retry
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={ok ? 'text-success' : 'text-muted'}>{ok ? '✓' : '•'}</span>
      <span>{label}</span>
    </li>
  )
}
