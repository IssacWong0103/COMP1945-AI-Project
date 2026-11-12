import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl } from '../api/client'
import { Button, ButtonLink } from '../components/Button'
import { StudioShell } from '../components/StudioShell'
import { humanize } from '../constants'
import { track } from '../lib/analytics'
import {
  listLocalSavedLooks,
  pushActivity,
  removeLocalLook,
  type LocalSavedLook,
} from '../lib/activityStore'

export function Looks() {
  const [localLooks, setLocalLooks] = useState<LocalSavedLook[]>(() => listLocalSavedLooks())

  useEffect(() => {
    document.title = 'Looks — USTyle'
    track('nav_tab_opened', { tab: 'looks' })
  }, [])

  const cards = useMemo(
    () =>
      [...localLooks].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [localLooks],
  )

  function onRemove(id: string) {
    if (!window.confirm('Remove this saved look?')) return
    removeLocalLook(id)
    setLocalLooks(listLocalSavedLooks())
    pushActivity({ kind: 'look_removed', title: 'Look removed', href: '/looks' })
  }

  return (
    <StudioShell
      activeTab="saved"
      title="Saved looks"
      description="A few good combinations, kept. Made from your closet."
    >
      <div className="mb-4 flex justify-end">
        <ButtonLink to="/studio">+ Create a new look</ButtonLink>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-5 py-14 text-center">
          <p className="text-sm font-semibold text-ink">No saved looks yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Save a look you love in Studio and it will show up here.
          </p>
          <div className="mt-4">
            <ButtonLink to="/studio">Open Studio</ButtonLink>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((look) => (
          <article key={look.id} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className="overflow-hidden rounded-lg bg-canvas">
              {look.thumbnailUrl ? (
                <img
                  src={apiUrl(look.thumbnailUrl)}
                  alt=""
                  className="aspect-[4/5] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center text-sm text-muted">
                  No preview
                </div>
              )}
            </div>
            <div className="mt-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">{humanize(look.venue)}</p>
                <p className="text-xs text-muted">
                  {new Date(look.createdAt).toLocaleDateString()} · local
                </p>
              </div>
              <p className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-navy">
                {(look.overallScore * 100).toFixed(0)}% match
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                to={`/studio?venue=${encodeURIComponent(look.venue)}`}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white no-underline"
              >
                Open
              </Link>
              <Button type="button" variant="danger" onClick={() => onRemove(look.id)}>
                Remove
              </Button>
            </div>
          </article>
        ))}
      </div>
    </StudioShell>
  )
}
