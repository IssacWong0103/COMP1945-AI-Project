import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiUrl, friendlyError, getProfile, pollTryOn } from '../api/client'
import { Button, ButtonLink } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { Spinner } from '../components/Spinner'
import { humanize } from '../constants'
import { track } from '../lib/analytics'
import {
  listActivity,
  listLocalSavedLooks,
  pushActivity,
  saveLocalLook,
} from '../lib/activityStore'
import { loadStudioSession, saveStudioSession } from '../studio/sessionStore'
import type { Outfit, Profile } from '../types'

type TryOnStatus = 'idle' | 'rendering' | 'ready' | 'failed'

function updateStudioSessionTryOnUrl(outfitId: string, url: string | null) {
  const snapshot = loadStudioSession()
  if (!snapshot?.outfits) return
  const outfits = snapshot.outfits.map((outfit) =>
    outfit.id === outfitId ? { ...outfit, tryOnUrl: url } : outfit,
  )
  saveStudioSession({ ...snapshot, outfits })
}

export function TryOnPage() {
  const [params] = useSearchParams()
  const outfitId = params.get('outfitId') ?? ''
  const venue = params.get('venue') ?? ''

  const session = useMemo(() => loadStudioSession(), [])
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
  const abortRef = useRef<AbortController | null>(null)
  const hasStartedRef = useRef(false)

  useEffect(() => {
    document.title = 'Try-On — USTyle'
    track('nav_tab_opened', { tab: 'try-on' })
    return () => abortRef.current?.abort()
  }, [])

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
      updateStudioSessionTryOnUrl(target.id, result.tryOnUrl)
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

  const sessions = useMemo(
    () =>
      listActivity(40).filter((item) =>
        ['tryon_started', 'tryon_ready', 'tryon_failed'].includes(item.kind),
      ),
    [status, tryOnUrl, error],
  )

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
              <p className="text-xs text-muted">{(outfit.overallScore * 100).toFixed(0)}% match</p>
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
                  Add a full-body photo in Settings to try on outfits.
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
                to="/settings"
                className="inline-flex w-full items-center justify-center rounded-lg bg-navy px-3.5 py-2 text-sm font-semibold text-white no-underline"
              >
                Add a full-body photo in Settings
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

      <div className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-sm font-semibold text-ink">How it works</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Create outfits in Studio.</li>
          <li>Press Try on on a result card.</li>
          <li>Wait for rendering on this page.</li>
          <li>Download, save, or retry if it fails.</li>
        </ol>
      </div>

      <section className="mt-6">
        <h3 className="text-sm font-semibold text-ink">Recent sessions</h3>
        {sessions.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-10 text-sm text-muted">
            No try-on sessions yet.{' '}
            <Link to="/studio" className="font-semibold text-navy underline">
              Create a look
            </Link>{' '}
            to start one.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {sessions.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  {item.detail ? <p className="text-xs text-muted">{item.detail}</p> : null}
                </div>
                <time className="shrink-0 text-xs text-muted">
                  {new Date(item.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
