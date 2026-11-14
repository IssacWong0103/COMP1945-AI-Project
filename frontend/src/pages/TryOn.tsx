import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiUrl, friendlyError, getProfile, listTryOns, pollTryOn } from '../api/client'
import { Button, ButtonLink } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { Spinner } from '../components/Spinner'
import { humanize } from '../constants'
import { track } from '../lib/analytics'
import {
  listLocalSavedLooks,
  pushActivity,
  saveLocalLook,
} from '../lib/activityStore'
import {
  loadStudioSession,
  updateStudioSession,
} from '../studio/sessionStore'
import type { Outfit, Profile, TryOnHistoryItem } from '../types'

type TryOnStatus = 'idle' | 'rendering' | 'ready' | 'failed'

export function TryOnPage() {
  const [params] = useSearchParams()
  const session = useMemo(() => loadStudioSession(), [])
  const outfitId = params.get('outfitId') || session?.tryOnOutfitId || ''
  const venue = params.get('venue') || session?.tryOnVenue || ''

  const outfit = useMemo(
    () => session?.outfits?.find((candidate) => candidate.id === outfitId) ?? null,
    [session, outfitId],
  )

  const [status, setStatus] = useState<TryOnStatus>(() => (outfit?.tryOnUrl ? 'ready' : 'idle'))
  const [tryOnUrl, setTryOnUrl] = useState<string | null>(() => outfit?.tryOnUrl ?? null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState(() =>
    listLocalSavedLooks().some((look) => look.id === outfitId),
  )
  const [history, setHistory] = useState<TryOnHistoryItem[]>([])
  const [openHistory, setOpenHistory] = useState<TryOnHistoryItem | null>(null)
  const [historySavedIds, setHistorySavedIds] = useState<Set<string>>(
    () => new Set(listLocalSavedLooks().map((look) => look.id)),
  )
  const abortRef = useRef<AbortController | null>(null)
  const hasStartedRef = useRef(false)

  useEffect(() => {
    if (!openHistory) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenHistory(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openHistory])

  useEffect(() => {
    let cancelled = false
    listTryOns()
      .then((result) => {
        if (!cancelled) setHistory(result.results)
      })
      .catch(() => {
        if (!cancelled) setHistory([])
      })
    return () => {
      cancelled = true
    }
  }, [status])

  useEffect(() => {
    document.title = 'Try-On — USTyle'
    track('nav_tab_opened', { tab: 'try-on' })
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (!outfitId) return
    updateStudioSession({ tryOnOutfitId: outfitId, tryOnVenue: venue })
  }, [outfitId, venue])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const next = await getProfile()
        if (!cancelled) setProfile(next)
      } catch {
        if (!cancelled) setProfile(null)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function runTryOn(target: Outfit) {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setStatus('rendering')
    setError(null)
    setTryOnUrl(null)
    setElapsed(0)
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 200)
    track('studio_tryon_started', { outfitId: target.id })
    pushActivity({
      kind: 'tryon_started',
      title: 'Try-on started',
      detail: venue || target.id,
      href: '/try-on',
    })
    try {
      const result = await pollTryOn(target.id, { signal: ctrl.signal })
      window.clearInterval(timer)
      setTryOnUrl(result.tryOnUrl)
      setStatus('ready')
      track('studio_tryon_ready', { outfitId: target.id })
      pushActivity({ kind: 'tryon_ready', title: 'Try-on ready', href: '/try-on' })
    } catch (err) {
      window.clearInterval(timer)
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = friendlyError(err)
      setError(message)
      setStatus('failed')
      track('studio_tryon_failed', { outfitId: target.id, reason: message })
      pushActivity({
        kind: 'tryon_failed',
        title: 'Try-on failed',
        detail: message,
        href: '/try-on',
      })
    }
  }

  useEffect(() => {
    if (!outfit || status !== 'idle' || hasStartedRef.current) return
    if (!profile?.bodyPhotoUrl) return
    hasStartedRef.current = true
    void runTryOn(outfit)
  }, [outfit, profile?.bodyPhotoUrl, status])

  function onSave() {
    if (!outfit || !tryOnUrl) return
    saveLocalLook({
      id: outfit.id,
      venue: venue || 'studio',
      overallScore: outfit.overallScore,
      createdAt: new Date().toISOString(),
      thumbnailUrl: tryOnUrl,
      items: outfit.items,
    })
    setSaved(true)
    track('studio_look_saved', { outfitId: outfit.id, venue })
    pushActivity({
      kind: 'look_saved',
      title: 'Look saved',
      detail: venue || 'Try-on',
      href: '/looks',
    })
  }

  function onSaveHistory(entry: TryOnHistoryItem) {
    saveLocalLook({
      id: entry.outfitId,
      venue: entry.venue || 'studio',
      overallScore: entry.overallScore,
      createdAt: entry.createdAt,
      thumbnailUrl: entry.tryOnUrl,
      items: entry.items,
    })
    setHistorySavedIds((prev) => new Set(prev).add(entry.outfitId))
    if (entry.outfitId === outfitId) setSaved(true)
    track('studio_look_saved', { outfitId: entry.outfitId, venue: entry.venue })
    pushActivity({
      kind: 'look_saved',
      title: 'Look saved',
      detail: entry.venue || 'Try-on',
      href: '/looks',
    })
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Try-On"
        description="Your virtual try-on photos, rendered from your full-body photo and Studio outfits."
        actions={<ButtonLink to="/studio">Open Studio</ButtonLink>}
      />

      {outfit ? (
        <section className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Try-on {venue ? ` · ${humanize(venue)}` : ''}
              </h3>
            </div>
            <Link to="/studio" className="text-sm font-semibold text-navy no-underline hover:underline">
              Back to Studio
            </Link>
          </div>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div className="relative overflow-hidden rounded-xl bg-canvas">
              {profile?.bodyPhotoUrl ? (
                <img
                  src={apiUrl(profile.bodyPhotoUrl)}
                  alt="Body photo before try-on"
                  className="aspect-[3/4] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center px-6 text-center text-sm text-muted">
                  Add a full-body photo in Profile to try on outfits.
                </div>
              )}
            </div>

            <div className="relative overflow-hidden rounded-xl bg-canvas">
              {status === 'ready' && tryOnUrl ? (
                <img
                  src={apiUrl(tryOnUrl)}
                  alt="Virtual try-on result"
                  className="aspect-[3/4] w-full object-cover"
                />
              ) : status === 'rendering' ? (
                <div className="flex aspect-[3/4] flex-col items-center justify-center px-6 text-center">
                  <Spinner label="Rendering your try-on…" />
                  <p className="mt-2 text-xs text-muted">{elapsed.toFixed(0)}s elapsed</p>
                </div>
              ) : status === 'failed' ? (
                <div className="flex aspect-[3/4] flex-col items-center justify-center px-6 text-center text-sm text-danger">
                  <p>{error || "The try-on didn't finish."}</p>
                </div>
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center px-6 text-center text-sm text-muted">
                  Your try-on photo will appear here.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {status === 'idle' && profile?.bodyPhotoUrl ? (
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  hasStartedRef.current = true
                  void runTryOn(outfit)
                }}
              >
                Start try-on
              </Button>
            ) : null}
            {status === 'idle' && !profile?.bodyPhotoUrl ? (
              <Link
                to="/profile"
                className="inline-flex w-full items-center justify-center rounded-lg bg-navy px-3.5 py-2 text-sm font-semibold text-white no-underline"
              >
                Add a full-body photo in Profile
              </Link>
            ) : null}
            {status === 'rendering' ? (
              <Button type="button" className="w-full" disabled>
                Rendering… {elapsed.toFixed(0)}s
              </Button>
            ) : null}
            {status === 'ready' ? (
              <>
                {tryOnUrl ? (
                  <a
                    href={apiUrl(tryOnUrl)}
                    download
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink no-underline hover:bg-canvas"
                  >
                    Download image
                  </a>
                ) : null}
                {saved ? (
                  <Button type="button" variant="secondary" disabled>
                    Saved
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" onClick={onSave}>
                    Save photo
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    hasStartedRef.current = true
                    void runTryOn(outfit)
                  }}
                >
                  Retry
                </Button>
              </>
            ) : null}
            {status === 'failed' ? (
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  hasStartedRef.current = true
                  void runTryOn(outfit)
                }}
              >
                Retry
              </Button>
            ) : null}
          </div>
        </section>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface px-5 py-10 text-center">
          <p className="text-sm font-semibold text-ink">No try-on selected</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Open Studio and press Try on a result card to generate a photo here.
          </p>
          <div className="mt-4">
            <ButtonLink to="/studio">Open Studio</ButtonLink>
          </div>
        </div>
      )}

      {history.length > 0 ? (
        <section className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-sm">
          <p className="text-sm font-semibold text-ink">Past try-ons</p>
          <p className="mt-1 text-xs text-muted">
            Your generated photos, kept on the server — they survive browser and app restarts.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {history.map((entry) => (
              <article
                key={entry.outfitId}
                className="overflow-hidden rounded-lg border border-line bg-canvas"
              >
                <img
                  src={apiUrl(entry.tryOnUrl)}
                  alt={`Past try-on for ${humanize(entry.venue)}`}
                  className="aspect-[3/4] w-full object-cover"
                />
                <div className="flex items-center justify-between gap-2 p-3">
                  <div>
                    <p className="text-xs font-semibold text-ink">{humanize(entry.venue)}</p>
                    <p className="text-xs text-muted">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setOpenHistory(entry)}>
                    View
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {openHistory ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Full size preview of past ${humanize(openHistory.venue)} try-on`}
          onClick={() => setOpenHistory(null)}
        >
          <div
            className="relative max-h-full max-w-3xl overflow-hidden rounded-xl bg-surface p-3 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={apiUrl(openHistory.tryOnUrl)}
              alt={`Past try-on for ${humanize(openHistory.venue)}`}
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{humanize(openHistory.venue)}</p>
                <p className="text-xs text-muted">
                  {new Date(openHistory.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={apiUrl(openHistory.tryOnUrl)}
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink no-underline hover:bg-canvas"
                >
                  Download
                </a>
                {historySavedIds.has(openHistory.outfitId) ? (
                  <Button type="button" variant="secondary" disabled>
                    Saved
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onSaveHistory(openHistory)}
                  >
                    Save
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={() => setOpenHistory(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-sm font-semibold text-ink">How it works</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Create outfits in Studio.</li>
          <li>Press Try on on a result card.</li>
          <li>Wait for rendering on this page.</li>
          <li>Download or save the generated photo.</li>
        </ol>
      </div>
    </div>
  )
}
