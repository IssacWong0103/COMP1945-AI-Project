import { useMemo } from 'react'
import { apiUrl } from '../api/client'
import { humanize, itemTitle } from '../constants'
import type { Outfit, WardrobeItem } from '../types'
import { Button } from './Button'

type Props = {
  outfit: Outfit
  slot: string | null
  items: WardrobeItem[]
  busy?: boolean
  onSelectSlot: (slot: string) => void
  onSwap: (item: WardrobeItem) => void
  onClose: () => void
}

export function SwapDrawer({
  outfit,
  slot,
  items,
  busy,
  onSelectSlot,
  onSwap,
  onClose,
}: Props) {
  const slots = useMemo(
    () =>
      Array.from(
        new Set(outfit.items.map((item) => item.category).filter(Boolean)),
      ),
    [outfit.items],
  )
  const activeSlot = slot && slots.includes(slot) ? slot : slots[0] ?? null
  const candidates = useMemo(() => {
    if (!activeSlot) return []
    const used = new Set(outfit.items.map((item) => item.id))
    return items.filter((item) => item.category === activeSlot && !used.has(item.id))
  }, [activeSlot, items, outfit.items])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-title"
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="swap-title" className="text-base font-semibold text-ink">
              Swap a piece
            </h3>
            <p className="mt-1 text-sm text-muted">
              Replace one slot while keeping the rest of this look.
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {slots.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => onSelectSlot(entry)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                entry === activeSlot ? 'bg-navy text-white' : 'bg-canvas text-muted'
              }`}
            >
              {humanize(entry)}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-2">
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-6 text-sm text-muted">
              No other {activeSlot ? humanize(activeSlot).toLowerCase() : 'items'} in your closet for
              this slot.
            </p>
          ) : (
            candidates.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                onClick={() => onSwap(item)}
                className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-left hover:border-navy/40 disabled:opacity-50"
              >
                <img
                  src={apiUrl(item.imageUrl)}
                  alt=""
                  className="h-14 w-11 rounded-md object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {itemTitle(item)}
                  </span>
                  <span className="block text-xs text-muted">
                    {humanize(item.category)}
                    {item.color ? ` · ${item.color}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
