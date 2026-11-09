import { apiUrl } from '../api/client'
import { humanize } from '../constants'
import { normalizeStyleReference } from '../studio/studioCopy'
import type { Outfit, TryOnResultKind } from '../types'
import { Button } from './Button'
import { Chip } from './Chip'
import { ResultImage } from './LocalPreviewBadge'
import { ScoreBar } from './ScoreBar'

type Props = {
  outfit: Outfit
  index: number
  tryOnUrl?: string | null
  resultKind?: TryOnResultKind | null
  rendering?: boolean
  onTryOn?: () => void
  onSwap?: () => void
  onSave?: () => void
  saved?: boolean
}

export function OutfitCard({
  outfit,
  index,
  tryOnUrl,
  resultKind,
  rendering,
  onTryOn,
  onSwap,
  onSave,
  saved,
}: Props) {
  const look = index + 1
  const kind = resultKind ?? outfit.tryOnResultKind ?? null
  const preview = kind === 'generated' || kind === 'collage' ? tryOnUrl || outfit.tryOnUrl : null
  const reference = normalizeStyleReference(outfit.styleReference)

  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 shadow-sm">
      <header className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">Outfit {look}</p>
        <p className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold tabular-nums text-navy">
          {(outfit.overallScore * 100).toFixed(0)}% match
        </p>
      </header>

      {preview ? (
        <div className="mb-3 overflow-hidden rounded-lg border border-line">
          <ResultImage
            src={preview}
            alt={
              kind === 'collage'
                ? `Local preview for outfit ${look}, not a generated try-on`
                : `Generated try-on for outfit ${look}`
            }
            resultKind={kind}
            className="aspect-[3/4] w-full object-cover"
          />
          {kind === 'collage' ? (
            <p className="px-2 py-1.5 text-xs text-ink">This is a preview, not a generated try-on.</p>
          ) : null}
        </div>
      ) : (
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
      )}

      {reference ? (
        <div className="mt-3 flex gap-2.5 rounded-lg border border-line bg-canvas p-2">
          {reference.imageUrl ? (
            <img
              src={apiUrl(reference.imageUrl)}
              alt=""
              className="h-14 w-11 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-navy">Inspired by</p>
            {reference.label || reference.id ? (
              <p className="text-sm font-semibold text-ink">{reference.label || reference.id}</p>
            ) : null}
            {reference.reason ? <p className="text-xs leading-relaxed text-ink">{reference.reason}</p> : null}
          </div>
        </div>
      ) : null}

      {rendering ? <p className="mt-3 text-xs font-medium text-navy">Rendering try-on…</p> : null}

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

      <div className="mt-4 grid gap-2">
        {onTryOn ? (
          <Button type="button" className="w-full" onClick={onTryOn}>
            Try on
          </Button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {onSwap ? (
            <Button type="button" variant="secondary" onClick={onSwap}>
              Swap a piece
            </Button>
          ) : null}
          {onSave ? (
            <Button type="button" variant="secondary" onClick={onSave} disabled={saved}>
              {saved ? 'Saved' : 'Save look'}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
