import { apiUrl } from '../api/client'
import { humanize } from '../constants'
import type { Outfit } from '../types'
import { Button } from './Button'
import { Chip } from './Chip'
import { ScoreBar } from './ScoreBar'

type Props = {
  outfit: Outfit
  index: number
  alternative?: boolean
  onTryOn?: () => void
  onSwap?: () => void
}

export function OutfitCard({ outfit, index, alternative = false, onTryOn, onSwap }: Props) {
  const look = index + 1

  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 shadow-sm">
      <header className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{alternative ? 'Alternative' : 'Outfit'} {look}</p>
      </header>

      <div className="mb-3 grid grid-cols-3 gap-2">
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
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-muted">Outfit formality</span>
          <span className="font-semibold tabular-nums text-navy">
            {Number.isFinite(outfit.formalityScore) ? `${Math.round(outfit.formalityScore)}/100` : '—'}
          </span>
        </div>
        <ScoreBar label="Venue fit" value={outfit.venueFitScore} />
        <ScoreBar label="Cohesion" value={outfit.cohesionScore} />
        <ScoreBar label="Overall" value={outfit.overallScore} />
      </div>

      <div className="mt-4 flex-1">
        <p className="text-sm leading-relaxed text-muted">{outfit.rationale}</p>
        {outfit.rationaleItems && outfit.rationaleItems.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {outfit.rationaleItems.map((entry) => {
              const item = outfit.items.find((candidate) => candidate.id === entry.itemId)
              return (
                <li key={entry.itemId} className="flex items-start gap-2">
                  {item?.imageUrl ? (
                    <img
                      src={apiUrl(item.imageUrl)}
                      alt=""
                      className="mt-0.5 h-10 w-8 shrink-0 rounded object-cover"
                    />
                  ) : null}
                  <p className="text-xs leading-relaxed text-muted">{entry.reason}</p>
                </li>
              )
            })}
          </ul>
        ) : null}
        {outfit.inspiration ? (
          <p className="mt-3 rounded-lg bg-canvas px-2.5 py-1.5 text-xs text-muted">
            How we picked this: {outfit.inspiration}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2">
        {onTryOn ? (
          <Button type="button" className="w-full" onClick={onTryOn}>
            Try on
          </Button>
        ) : null}
        {onSwap ? (
          <Button type="button" variant="secondary" className="w-full" onClick={onSwap}>
            Swap a piece
          </Button>
        ) : null}
      </div>
    </article>
  )
}
