import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl, friendlyError, listSavedLooks } from '../api/client'
import { Button, ButtonLink } from '../components/Button'
import { ErrorNote } from '../components/ErrorNote'
import { Spinner } from '../components/Spinner'
import { StudioShell } from '../components/StudioShell'
import { humanize } from '../constants'
import { track } from '../lib/analytics'
import {
  listLocalSavedLooks,
  pushActivity,
  removeLocalLook,
  type LocalSavedLook,
} from '../lib/activityStore'
import type { SavedLook } from '../types'

type LookCard = {
  id: string
  venue: string
  overallScore: number
  createdAt: string
  thumbnailUrl: string | null
  source: 'local' | 'api'
}

export function Looks() {
  const [apiLooks, setApiLooks] = useState<SavedLook[]>([])
  const [localLooks, setLocalLooks] = useState<LocalSavedLook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Looks — USTyle'
    track('nav_tab_opened', { tab: 'looks' })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLocalLooks(listLocalSavedLooks())
      try {
        const looks = await listSavedLooks()
        if (!cancelled) setApiLooks(looks)
      } catch (err) {
        if (!cancelled) setError(friendlyError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const cards = useMemo(() => {
    const map = new Map<string, LookCard>()
    for (const look of localLooks) {
      map.set(look.id, {
        id: look.id,
        venue: look.venue,
        overallScore: look.overallScore,
        createdAt: look.createdAt,
        thumbnailUrl: look.thumbnailUrl,
        source: 'local',
      })
    }
    for (const look of apiLooks) {
      if (map.has(look.id)) continue
      map.set(look.id, {
        id: look.id,
        venue: look.venue,
        overallScore: look.overallScore,
        createdAt: look.createdAt,
        thumbnailUrl: look.thumbnailUrl,
        source: 'api',
      })
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [apiLooks, localLooks])

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

      {loading ? <Spinner label="Loading saved looks…" /> : null}
      {error ? <ErrorNote title="Could not load server looks" message={error} /> : null}

      {!loading && cards.length === 0 ? (
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
                  {new Date(look.createdAt).toLocaleDateString()} · {look.source}
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
              {look.source === 'local' ? (
                <Button type="button" variant="danger" onClick={() => onRemove(look.id)}>
                  Remove
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </StudioShell>
  )
}
