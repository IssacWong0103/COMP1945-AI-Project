import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl } from '../api/client'
import { humanize } from '../constants'
import {
  collageExplanation,
  renderingCopy,
  styleReferenceForOutfit,
  type NormalizedStyleReference,
} from '../studio/studioCopy'
import type { Outfit, TryOnFallbackReason } from '../types'
import { Button } from './Button'
import { ResultImage } from './LocalPreviewBadge'
import { Spinner } from './Spinner'

export type TryOnDrawerStatus =
  | 'idle'
  | 'rendering'
  | 'ready-generated'
  | 'ready-collage'
  | 'failed'

type Props = {
  outfit: Outfit
  status: TryOnDrawerStatus
  elapsedSec: number
  tryOnUrl: string | null
  fallbackReason?: TryOnFallbackReason | null
  detail?: string | null
  errorTitle?: string | null
  errorMessage?: string | null
  offerPreview?: boolean
  beforeUrl?: string | null
  onStart: () => void
  onRetry: () => void
  onShowPreview?: () => void
  onSave: () => void
  onClose: () => void
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function TryOnDrawer({
  outfit,
  status,
  elapsedSec,
  tryOnUrl,
  fallbackReason,
  detail,
  errorTitle,
  errorMessage,
  offerPreview,
  beforeUrl,
  onStart,
  onRetry,
  onShowPreview,
  onSave,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const reference = styleReferenceForOutfit({
    styleReference: outfit.styleReference,
    styleReferenceUrl: outfit.tryOnStyleReferenceUrl,
  })

  useEffect(() => {
    const node = dialogRef.current
    if (!node) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () =>
      [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'))
    focusable()[0]?.focus()

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus()
    }
  }, [])

  const showingResult =
    (status === 'ready-generated' || status === 'ready-collage') && Boolean(tryOnUrl)
  const imageAlt =
    status === 'ready-collage'
      ? 'Local preview of you and your clothes, not a generated try-on'
      : 'Generated try-on'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tryon-title"
        aria-describedby="tryon-live"
        className="flex max-h-[92svh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h3 id="tryon-title" className="text-sm font-semibold text-ink">
              {status === 'ready-collage' ? 'Local preview' : 'Try on · Outfit'}
            </h3>
            <p className="text-xs text-muted">{(outfit.overallScore * 100).toFixed(0)}% match</p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="relative shrink-0 bg-canvas">
          {showingResult && tryOnUrl ? (
            <ResultImage
              src={tryOnUrl}
              alt={imageAlt}
              resultKind={status === 'ready-collage' ? 'collage' : 'generated'}
              className="aspect-[3/4] max-h-[52svh] w-full object-cover"
            />
          ) : beforeUrl ? (
            <img
              src={apiUrl(beforeUrl)}
              alt="Your full-body photo"
              className="aspect-[3/4] max-h-[52svh] w-full object-cover opacity-90"
            />
          ) : (
            <div className="flex aspect-[3/4] max-h-[52svh] items-center justify-center px-6 text-center text-sm text-ink">
              Add a full-body photo to see yourself in this outfit.
            </div>
          )}

          {status === 'rendering' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/55 px-6 text-center text-white">
              <Spinner label="" />
              <p className="mt-3 text-sm font-semibold">{elapsedSec.toFixed(0)}s elapsed</p>
              <p className="mt-1 text-xs text-white/90">{renderingCopy(Boolean(reference))}</p>
              <p className="mt-2 text-xs text-white/75">You can close this and keep browsing.</p>
            </div>
          ) : null}
        </div>

        <p id="tryon-live" className="sr-only" role="status">
          {status === 'rendering'
            ? renderingCopy(Boolean(reference))
            : status === 'ready-generated'
              ? 'Generated try-on'
              : status === 'ready-collage'
                ? 'Local preview. This is a preview, not a generated try-on.'
                : status === 'failed'
                  ? errorTitle || "The try-on didn't finish."
                  : reference
                    ? 'Try-on. We’ll use this look as a style reference.'
                    : 'Try-on'}
        </p>
        <div className="space-y-3 overflow-y-auto p-4">
          {status === 'idle' ? (
            <>
              <OutfitStrip outfit={outfit} />
              {reference ? <ReferenceRow reference={reference} /> : null}
              {beforeUrl ? (
                <>
                  <Button type="button" className="w-full" onClick={onStart}>
                    Start try-on
                  </Button>
                  <p className="text-xs text-muted">Usually under a minute and a half.</p>
                  {reference ? (
                    <p className="text-xs text-muted">We’ll use this look as a style reference.</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-ink">
                  <Link to="/settings" className="font-semibold text-navy underline">
                    Add a full-body photo in Settings
                  </Link>{' '}
                  to see yourself in this outfit. Your clothes stay as they are.
                </p>
              )}
            </>
          ) : null}

          {status === 'rendering' ? (
            <Button type="button" className="w-full" disabled>
              Rendering… {elapsedSec.toFixed(0)}s
            </Button>
          ) : null}

          {status === 'ready-generated' ? (
            <>
              <p className="text-sm text-ink">Generated try-on</p>
              {reference ? <ReferenceRow reference={reference} compact /> : null}
              <div className="flex flex-wrap gap-2">
                {tryOnUrl ? <DownloadLink href={tryOnUrl} label="Download image" /> : null}
                <Button type="button" variant="secondary" onClick={onSave}>
                  Save look
                </Button>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            </>
          ) : null}

          {status === 'ready-collage' ? (
            <>
              <p className="text-sm font-semibold text-ink">This is a preview, not a generated try-on.</p>
              <p className="text-sm leading-relaxed text-ink">
                {collageExplanation(fallbackReason, detail)}
              </p>
              <Button type="button" className="w-full" onClick={onRetry}>
                Retry try-on
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={onSave}>
                  Save preview
                </Button>
                {tryOnUrl ? <DownloadLink href={tryOnUrl} label="Download" /> : null}
                <Button type="button" variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            </>
          ) : null}

          {status === 'failed' ? (
            <>
              <p className="text-sm font-semibold text-ink">
                {errorTitle || "The try-on didn't finish."}
              </p>
              <p className="text-sm leading-relaxed text-ink">
                {errorMessage || "It's safe to try again."}
              </p>
              <Button type="button" className="w-full" onClick={onRetry}>
                Retry
              </Button>
              {offerPreview && onShowPreview ? (
                <Button type="button" variant="secondary" className="w-full" onClick={onShowPreview}>
                  Show a local preview instead
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={apiUrl(href)}
      download
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink no-underline hover:bg-canvas"
    >
      {label}
    </a>
  )
}

function OutfitStrip({ outfit }: { outfit: Outfit }) {
  if (outfit.items.length === 0) return null
  return (
    <ul className="flex gap-2 overflow-x-auto pb-1">
      {outfit.items.map((item) => (
        <li key={item.id} className="w-16 shrink-0">
          {item.imageUrl ? (
            <img
              src={apiUrl(item.imageUrl)}
              alt={item.description || humanize(item.category)}
              className="aspect-square w-full rounded-md object-cover"
            />
          ) : (
            <div className="flex aspect-square items-end rounded-md bg-navy p-1 text-[10px] font-medium text-white">
              {humanize(item.category)}
            </div>
          )}
          <p className="mt-1 truncate text-[10px] text-muted">{humanize(item.category)}</p>
        </li>
      ))}
    </ul>
  )
}

function ReferenceRow({
  reference,
  compact,
}: {
  reference: NormalizedStyleReference
  compact?: boolean
}) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-line bg-canvas p-2">
      {reference.imageUrl ? (
        <img
          src={apiUrl(reference.imageUrl)}
          alt=""
          className={compact ? 'h-12 w-9 shrink-0 rounded object-cover' : 'h-16 w-12 shrink-0 rounded-md object-cover'}
        />
      ) : null}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-navy">
          {compact ? 'Style reference' : 'Inspired by'}
        </p>
        {reference.label || reference.id ? (
          <p className="text-sm font-semibold text-ink">{reference.label || reference.id}</p>
        ) : null}
        {reference.reason ? <p className="text-xs leading-relaxed text-ink">{reference.reason}</p> : null}
      </div>
    </div>
  )
}
