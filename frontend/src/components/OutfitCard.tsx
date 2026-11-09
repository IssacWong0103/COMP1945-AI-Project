import { apiUrl } from '../api/client'
import { humanize } from '../constants'
import type { Outfit } from '../types'
import { Button } from './Button'
import { Chip } from './Chip'
import { ScoreBar } from './ScoreBar'

type Props = {
  outfit: Outfit
  index: number
  tryOnUrl?: string | null
  onTryOn?: () => void
  onSwap?: () => void
  onSave?: () => void
  saved?: boolean
}

export function OutfitCard({
  outfit,
  index,
  tryOnUrl,
  onTryOn,
  onSwap,
  onSave,
  saved,
}: Props) {
  const look = index + 1
  const preview = tryOnUrl || outfit.tryOnUrl

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
          <img
            src={apiUrl(preview)}
            alt={`Try-on preview for outfit ${look}`}
            className="aspect-[3/4] w-full object-cover"
          />
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
