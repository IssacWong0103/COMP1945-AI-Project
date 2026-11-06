import { useEffect, useRef, useState } from 'react'
import { apiUrl, friendlyError, pollTryOn } from '../api/client'
import { humanize } from '../constants'
import type { Outfit } from '../types'
import { Button } from './Button'
import { Chip } from './Chip'
import { ErrorNote } from './ErrorNote'
import { ScoreBar } from './ScoreBar'
import { Spinner } from './Spinner'

type Props = {
  outfit: Outfit
  index: number
}

export function OutfitCard({ outfit, index }: Props) {
  const look = index + 1
  const [tryOnUrl, setTryOnUrl] = useState(outfit.tryOnUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const id = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 200)
    return () => window.clearInterval(id)
  }, [busy])

  async function onTryOn() {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(null)
    setBusy(true)
    setElapsed(0)
    try {
      const result = await pollTryOn(outfit.id, { signal: ctrl.signal })
      setTryOnUrl(result.tryOnUrl)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 shadow-sm">
      <header className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">Outfit {look}</p>
        <p className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold tabular-nums text-navy">
          {(outfit.overallScore * 100).toFixed(0)}% match
        </p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {outfit.items.map((item) => (
          <figure key={item.id} className="overflow-hidden rounded-lg bg-canvas">
            {item.imageUrl ? (
              <img
                src={apiUrl(item.imageUrl)}
                alt={item.description || humanize(item.category)}
                className="aspect-[3/4] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[3/4] items-end bg-navy p-2 text-[10px] font-medium uppercase tracking-wide text-white">
                {humanize(item.category)}
              </div>
            )}
            <figcaption className="truncate px-1.5 py-1.5 text-[11px] text-muted">
              {humanize(item.category)}
              {item.color ? ` · ${item.color}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {outfit.items.map((item) => (
          <Chip key={`${item.id}-chip`}>{humanize(item.category)}</Chip>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <ScoreBar label="Venue fit" value={outfit.venueFitScore} />
        <ScoreBar label="Cohesion" value={outfit.cohesionScore} />
        <ScoreBar label="Overall" value={outfit.overallScore} />
      </div>

      <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">{outfit.rationale}</p>

      <div className="mt-4">
        <Button type="button" className="w-full" disabled={busy} onClick={() => void onTryOn()}>
          {busy ? `Rendering try-on · ${elapsed.toFixed(0)}s` : 'Virtual try-on'}
        </Button>
      </div>

      {busy ? (
        <div className="mt-3">
          <Spinner
            label={
              elapsed < 8
                ? 'Generating try-on image…'
                : elapsed < 20
                  ? 'Still rendering — usually under 20s.'
                  : 'Taking longer than usual. Hang on.'
            }
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <ErrorNote message={error} title="Try-on failed" />
        </div>
      ) : null}

      {tryOnUrl ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <img
            src={apiUrl(tryOnUrl)}
            alt={`Virtual try-on for outfit ${look}`}
            className="aspect-[3/4] w-full object-cover"
          />
        </div>
      ) : null}
    </article>
  )
}
