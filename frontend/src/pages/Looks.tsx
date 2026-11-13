import { useEffect, useMemo, useState } from 'react'
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
  const [openLook, setOpenLook] = useState<LocalSavedLook | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    document.title = 'Looks — USTyle'
    track('nav_tab_opened', { tab: 'looks' })
  }, [])

  useEffect(() => {
    if (!openLook) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenLook(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openLook])

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

  async function onDownload(look: LocalSavedLook) {
    if (!look.thumbnailUrl || downloading) return
    setDownloading(true)
    try {
      const response = await fetch(apiUrl(look.thumbnailUrl))
      if (!response.ok) throw new Error(`Download failed (${response.status})`)
      const blob = await response.blob()
      const extension = blob.type.split('/')[1] || 'png'
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${humanize(look.venue)}-look.${extension}`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      window.alert('Could not download this image. Please try again.')
    } finally {
      setDownloading(false)
    }
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
              <button
                type="button"
                onClick={() => setOpenLook(look)}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white no-underline"
              >
                Open
              </button>
              <Button type="button" variant="danger" onClick={() => onRemove(look.id)}>
                Remove
              </Button>
            </div>
          </article>
        ))}
      </div>

      {openLook ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Full size preview of ${humanize(openLook.venue)} look`}
          onClick={() => setOpenLook(null)}
        >
          <div
            className="relative max-h-full max-w-3xl overflow-hidden rounded-xl bg-surface p-3 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            {openLook.thumbnailUrl ? (
              <img
                src={apiUrl(openLook.thumbnailUrl)}
                alt=""
                className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center text-sm text-muted">
                No preview
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{humanize(openLook.venue)}</p>
                <p className="text-xs text-muted">
                  {new Date(openLook.createdAt).toLocaleDateString()} ·{' '}
                  {(openLook.overallScore * 100).toFixed(0)}% match
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onDownload(openLook)}
                  disabled={!openLook.thumbnailUrl || downloading}
                >
                  {downloading ? 'Downloading…' : 'Download'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setOpenLook(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </StudioShell>
  )
}
