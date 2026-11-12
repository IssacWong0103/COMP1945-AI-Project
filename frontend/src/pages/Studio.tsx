import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  friendlyError,
  getProfile,
  getVenues,
  listWardrobeItems,
  pollTryOn,
  recommend,
} from '../api/client'
import { RecoveryPanel } from '../components/RecoveryPanel'
import { OutfitCard } from '../components/OutfitCard'
import { Spinner } from '../components/Spinner'
import { StudioShell } from '../components/StudioShell'
import { SuggestSelect } from '../components/SuggestSelect'
import { SwapDrawer } from '../components/SwapDrawer'
import { TryOnDrawer, type TryOnDrawerStatus } from '../components/TryOnDrawer'
import { Button } from '../components/Button'
import {
  DRESS_CODE_OPTIONS,
  FALLBACK_VENUES,
  FEEDBACK_SUGGESTIONS,
  STYLE_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  WEATHER_OPTIONS,
} from '../constants'
import { track } from '../lib/analytics'
import {
  listLocalSavedLooks,
  pushActivity,
  pushAlert,
  saveLocalLook,
} from '../lib/activityStore'
import { primaryCtaLabel } from '../studio/actionLayout'
import { resolveRecovery } from '../studio/recovery'
import {
  INITIAL_STUDIO_STATE,
  reduceStudioState,
  type StudioEvent,
} from '../studio/stateMachine'
import type { Outfit, VenueInfo, WardrobeItem } from '../types'

export function Studio() {
  const [params, setParams] = useSearchParams()
  const venueFromUrl = params.get('venue') ?? ''

  const [machine, dispatch] = useReducer(reduceStudioState, INITIAL_STUDIO_STATE)
  const [venues, setVenues] = useState<VenueInfo[]>(FALLBACK_VENUES)
  const [venue, setVenue] = useState(venueFromUrl)
  const [styleOverride, setStyleOverride] = useState('')
  const [fineTuneOpen, setFineTuneOpen] = useState(false)
  const [outfits, setOutfits] = useState<Outfit[] | null>(null)
  const [tick, setTick] = useState(0)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [hasBodyPhoto, setHasBodyPhoto] = useState<boolean | null>(null)
  const [bodyPhotoUrl, setBodyPhotoUrl] = useState<string | null>(null)
  const [closetItems, setClosetItems] = useState<WardrobeItem[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [tryOnStatus, setTryOnStatus] = useState<TryOnDrawerStatus>('idle')
  const [tryOnUrl, setTryOnUrl] = useState<string | null>(null)
  const [tryOnError, setTryOnError] = useState<string | null>(null)
  const [tryOnElapsed, setTryOnElapsed] = useState(0)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackHistory, setFeedbackHistory] = useState<{ id: string; text: string }[]>([])
  const [weather, setWeather] = useState('')
  const [timeOfDay, setTimeOfDay] = useState('')
  const [dressCode, setDressCode] = useState('')
  const [occasionNotes, setOccasionNotes] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const lastFeedbackRef = useRef<string | null>(null)

  useEffect(() => {
    document.title = 'Studio — USTyle'
  }, [])

  useEffect(() => {
    if (venueFromUrl && venueFromUrl !== venue) setVenue(venueFromUrl)
  }, [venueFromUrl, venue])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const list = await getVenues()
        if (!cancelled && list.length) setVenues(list)
      } catch {
        /* keep fallback */
      }
      try {
        const [profile, items] = await Promise.all([getProfile(), listWardrobeItems()])
        if (cancelled) return
        setHasBodyPhoto(Boolean(profile.bodyPhotoUrl))
        setBodyPhotoUrl(profile.bodyPhotoUrl)
        setClosetItems(items)
      } catch {
        if (!cancelled) {
          setHasBodyPhoto(null)
          setClosetItems([])
        }
      }
      if (!cancelled) {
        setSavedIds(new Set(listLocalSavedLooks().map((look) => look.id)))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (machine.phase !== 'creating') return
    const started = Date.now()
    const id = window.setInterval(() => setTick((Date.now() - started) / 1000), 150)
    return () => window.clearInterval(id)
  }, [machine.phase])

  useEffect(() => {
    if (tryOnStatus !== 'rendering') return
    const started = Date.now()
    const id = window.setInterval(() => setTryOnElapsed((Date.now() - started) / 1000), 200)
    return () => window.clearInterval(id)
  }, [tryOnStatus])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const selectedVenue = useMemo(
    () => venues.find((entry) => entry.id === venue),
    [venues, venue],
  )

  const activeOutfit = useMemo(
    () => outfits?.find((outfit) => outfit.id === machine.activeOutfitId) ?? null,
    [outfits, machine.activeOutfitId],
  )

  const recovery = resolveRecovery({
    phase:
      machine.phase === 'partial' || machine.phase === 'failure'
        ? machine.phase
        : machine.phase === 'results'
          ? 'results'
          : 'idle',
    warning: machine.lastWarning,
    error: machine.lastError,
    outfitCount: machine.outfitCount,
    closetCount: closetItems.length,
    hasBodyPhoto: machine.phase === 'idle' ? hasBodyPhoto : undefined,
  })

  function emit(event: StudioEvent) {
    dispatch(event)
  }

  function pickVenue(id: string) {
    setVenue(id)
    setParams(id ? { venue: id } : {}, { replace: true })
    setFeedbackText('')
    setFeedbackHistory([])
    lastFeedbackRef.current = null
    emit({ type: 'EDIT_INPUTS' })
  }

  async function runCreate(feedback?: string) {
    if (!venue) {
      emit({ type: 'SUBMIT_INVALID' })
      return
    }
    if (feedback !== undefined) {
      lastFeedbackRef.current = feedback.trim() || null
    }
    emit({ type: 'SUBMIT_VALID' })
    setOutfits(null)
    setElapsedMs(null)
    setTick(0)
    track('studio_run_started', { venue, style: styleOverride || null })
    pushActivity({
      kind: 'run_started',
      title: 'Studio run started',
      detail: selectedVenue?.label ?? venue,
      href: '/studio',
    })
    try {
      const payload: {
        venue: string
        preferredStyle?: string
        feedback?: string
        weather?: string
        timeOfDay?: string
        dressCode?: string
        notes?: string
      } = { venue }
      if (styleOverride) payload.preferredStyle = styleOverride
      const feedback = lastFeedbackRef.current
      if (feedback) payload.feedback = feedback
      if (weather) payload.weather = weather
      if (timeOfDay) payload.timeOfDay = timeOfDay
      if (dressCode && dressCode !== 'none') payload.dressCode = dressCode
      if (occasionNotes.trim()) payload.notes = occasionNotes.trim()
      const result = await recommend(payload)
      setOutfits(result.outfits)
      setElapsedMs(result.elapsedMs)
      if (result.warning && result.outfits.length > 0) {
        emit({ type: 'RUN_PARTIAL', outfitCount: result.outfits.length, warning: result.warning })
        track('studio_run_partial', { count: result.outfits.length })
        pushActivity({
          kind: 'run_partial',
          title: 'Partial outfits ready',
          detail: result.warning,
          href: '/studio',
        })
      } else if (result.outfits.length === 0) {
        emit({
          type: 'RUN_FAILURE',
          message: 'No outfits returned. Add more wardrobe items and retry.',
        })
        track('studio_run_failed', { reason: 'empty' })
        pushActivity({ kind: 'run_failed', title: 'Studio run returned no outfits', href: '/studio' })
        pushAlert({
          severity: 'warning',
          title: 'No outfits generated',
          detail: 'Your closet may be too small for a full look.',
          href: '/wardrobe',
        })
      } else {
        emit({ type: 'RUN_SUCCESS', outfitCount: result.outfits.length })
        track('studio_run_completed', {
          count: result.outfits.length,
          elapsedMs: result.elapsedMs,
        })
        pushActivity({
          kind: 'run_completed',
          title: `${result.outfits.length} outfits ready`,
          detail: `${(result.elapsedMs / 1000).toFixed(1)}s`,
          href: '/studio',
        })
      }
    } catch (err) {
      const message = friendlyError(err)
      emit({ type: 'RUN_FAILURE', message })
      track('studio_run_failed', { reason: message })
      pushActivity({ kind: 'run_failed', title: 'Studio run failed', detail: message, href: '/studio' })
      pushAlert({
        severity: 'error',
        title: 'Studio generation failed',
        detail: message,
        href: '/studio',
      })
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    await runCreate()
  }

  function onRetry() {
    track('studio_retry_clicked', { phase: machine.phase })
    void runCreate()
  }

  function refineWithFeedback(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setFeedbackHistory((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: trimmed },
    ])
    setFeedbackText('')
    track('studio_refine_submitted', { venue, length: trimmed.length })
    void runCreate(trimmed)
  }

  function onSave(outfit: Outfit) {
    saveLocalLook({
      id: outfit.id,
      venue,
      overallScore: outfit.overallScore,
      createdAt: new Date().toISOString(),
      thumbnailUrl: outfit.items[0]?.imageUrl ?? outfit.tryOnUrl,
      items: outfit.items,
    })
    setSavedIds((prev) => new Set(prev).add(outfit.id))
    emit({ type: 'SAVE_LOOK', outfitId: outfit.id })
    track('studio_look_saved', { outfitId: outfit.id, venue })
    pushActivity({
      kind: 'look_saved',
      title: 'Look saved',
      detail: selectedVenue?.label ?? venue,
      href: '/looks',
    })
  }

  function onOpenSwap(outfit: Outfit) {
    emit({ type: 'OPEN_SWAP', outfitId: outfit.id, slot: outfit.items[0]?.category })
    track('studio_swap_opened', { outfitId: outfit.id })
  }

  function applySwap(item: WardrobeItem) {
    if (!activeOutfit || !machine.activeSlot) return
    setOutfits((prev) =>
      (prev ?? []).map((outfit) => {
        if (outfit.id !== activeOutfit.id) return outfit
        return {
          ...outfit,
          items: outfit.items.map((slotItem) =>
            slotItem.category === machine.activeSlot
              ? {
                  id: item.id,
                  category: item.category,
                  color: item.color,
                  description: item.description,
                  imageUrl: item.imageUrl,
                }
              : slotItem,
          ),
        }
      }),
    )
    track('studio_swap_applied', {
      outfitId: activeOutfit.id,
      slot: machine.activeSlot,
      itemId: item.id,
    })
    pushActivity({
      kind: 'swap_applied',
      title: `Swapped ${machine.activeSlot}`,
      detail: item.description || item.category,
      href: '/studio',
    })
    emit({ type: 'CLOSE_OVERLAY' })
  }

  async function startTryOn() {
    if (!activeOutfit) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setTryOnStatus('rendering')
    setTryOnError(null)
    setTryOnUrl(null)
    setTryOnElapsed(0)
    track('studio_tryon_started', { outfitId: activeOutfit.id })
    pushActivity({
      kind: 'tryon_started',
      title: 'Try-on started',
      detail: selectedVenue?.label ?? venue,
      href: '/try-on',
    })
    try {
      const result = await pollTryOn(activeOutfit.id, { signal: ctrl.signal })
      setTryOnUrl(result.tryOnUrl)
      setTryOnStatus('ready')
      setOutfits((prev) =>
        (prev ?? []).map((outfit) =>
          outfit.id === activeOutfit.id ? { ...outfit, tryOnUrl: result.tryOnUrl } : outfit,
        ),
      )
      track('studio_tryon_ready', { outfitId: activeOutfit.id })
      pushActivity({
        kind: 'tryon_ready',
        title: 'Try-on ready',
        href: '/try-on',
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = friendlyError(err)
      setTryOnError(message)
      setTryOnStatus('failed')
      track('studio_tryon_failed', { outfitId: activeOutfit.id, reason: message })
      pushActivity({
        kind: 'tryon_failed',
        title: 'Try-on failed',
        detail: message,
        href: '/try-on',
      })
      pushAlert({
        severity: 'error',
        title: 'Try-on failed',
        detail: message,
        href: '/try-on',
      })
    }
  }

  function openTryOn(outfit: Outfit) {
    emit({ type: 'OPEN_TRY_ON', outfitId: outfit.id })
    setTryOnStatus(outfit.tryOnUrl ? 'ready' : 'idle')
    setTryOnUrl(outfit.tryOnUrl)
    setTryOnError(null)
  }

  const busy = machine.phase === 'creating'

  return (
    <StudioShell activeTab="create">
      {recovery && machine.phase !== 'creating' && machine.phase !== 'results' ? (
        <div className="mb-4">
          <RecoveryPanel
            recovery={recovery}
            onRetry={onRetry}
            onAdjust={() => {
              emit({ type: 'EDIT_INPUTS' })
              setFineTuneOpen(true)
            }}
          />
        </div>
      ) : null}

      {hasBodyPhoto === false && machine.phase === 'results' ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No body photo yet.{' '}
          <Link to="/settings" className="font-semibold underline">
            Add one in Settings
          </Link>{' '}
          to unlock virtual try-on.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="h-fit rounded-xl border border-line bg-surface p-5 shadow-sm lg:col-span-4"
        >
          <p className="text-sm font-semibold text-ink">Plan</p>
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-muted">Where are you going?</legend>
            <div className="mt-2 grid gap-2">
              {venues.map((entry) => {
                const selected = entry.id === venue
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pickVenue(entry.id)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${
                      selected
                        ? 'border-navy bg-navy text-white'
                        : 'border-line bg-surface text-ink hover:border-navy/40'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{entry.label}</span>
                    <span className={`mt-0.5 block text-xs ${selected ? 'text-white/75' : 'text-muted'}`}>
                      {entry.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="mt-5">
            <label htmlFor="styleOverride" className="text-xs font-medium text-muted">
              What style? (optional)
            </label>
            <div className="mt-1.5">
              <SuggestSelect
                id="styleOverride"
                name="preferredStyle"
                value={styleOverride}
                options={STYLE_OPTIONS}
                placeholder="Use profile default"
                customPlaceholder="e.g. dark academia, preppy, Y2K"
                customHint="Leave on default to use Settings. Custom words are a soft hint."
                onChange={(value) => {
                  setStyleOverride(value)
                  emit({ type: 'EDIT_INPUTS' })
                }}
                disabled={busy}
              />
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-medium text-muted">Occasion details (optional)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEATHER_OPTIONS.map((option) => (
                <ContextChip
                  key={option.value}
                  selected={weather === option.value}
                  disabled={busy}
                  onClick={() => {
                    setWeather(weather === option.value ? '' : option.value)
                    emit({ type: 'EDIT_INPUTS' })
                  }}
                >
                  <span aria-hidden>{option.icon}</span> {option.label}
                </ContextChip>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TIME_OF_DAY_OPTIONS.map((option) => (
                <ContextChip
                  key={option.value}
                  selected={timeOfDay === option.value}
                  disabled={busy}
                  onClick={() => {
                    setTimeOfDay(timeOfDay === option.value ? '' : option.value)
                    emit({ type: 'EDIT_INPUTS' })
                  }}
                >
                  {option.label}
                </ContextChip>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DRESS_CODE_OPTIONS.map((option) => (
                <ContextChip
                  key={option.value}
                  selected={dressCode === option.value}
                  disabled={busy}
                  onClick={() => {
                    setDressCode(dressCode === option.value ? '' : option.value)
                    emit({ type: 'EDIT_INPUTS' })
                  }}
                >
                  {option.label}
                </ContextChip>
              ))}
            </div>
            <input
              value={occasionNotes}
              onChange={(event) => {
                setOccasionNotes(event.target.value)
                emit({ type: 'EDIT_INPUTS' })
              }}
              disabled={busy}
              placeholder="Anything else? e.g. standing all day, indoor event"
              className="mt-2 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition focus:border-navy disabled:opacity-50"
            />
          </div>

          <div className="mt-5">
            <button
              type="button"
              className="text-xs font-semibold text-navy"
              onClick={() => {
                setFineTuneOpen((open) => !open)
                emit({ type: 'OPEN_FINE_TUNE' })
              }}
            >
              {fineTuneOpen ? 'Hide fine-tune' : 'Fine-tune (optional)'}
            </button>
            {fineTuneOpen ? (
              <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
                Using {closetItems.length} closet pieces. Occasion details and style steer matching;
                after results appear you can refine with free-form feedback.
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            <Button type="submit" className="w-full" disabled={busy || !venue}>
              {primaryCtaLabel(busy, tick)}
            </Button>
            <p className="mt-2 text-xs text-muted">
              {selectedVenue
                ? `Target: ${selectedVenue.label}. Usually ready in under 20 seconds.`
                : 'Select where you’re going to continue.'}
            </p>
          </div>
        </form>

        <div className="lg:col-span-8">
          {busy ? (
            <div className="rounded-xl border border-line bg-surface px-5 py-8 shadow-sm">
              <Spinner label="Scoring outfits from your closet…" />
              <p className="mt-2 text-xs text-muted">
                Finding combinations, then checking how they fit your day. {tick.toFixed(1)}s
              </p>
              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="h-48 animate-pulse rounded-xl bg-canvas" />
                ))}
              </div>
            </div>
          ) : null}

          {machine.phase === 'failure' && machine.lastError ? (
            <RecoveryPanel
              recovery={{
                kind: 'failure',
                title: "Couldn't create outfits",
                message: machine.lastError,
                primary: { id: 'retry', label: 'Retry' },
                secondary: { id: 'openCloset', label: 'Open closet', to: '/wardrobe' },
              }}
              onRetry={onRetry}
              onAdjust={() => setFineTuneOpen(true)}
            />
          ) : null}

          {machine.phase === 'partial' && machine.lastWarning ? (
            <div className="mb-4">
              <RecoveryPanel
                recovery={{
                  kind: 'partial',
                  title: 'Partial results',
                  message: machine.lastWarning,
                  primary: { id: 'retry', label: 'Retry missing looks' },
                  secondary: { id: 'openCloset', label: 'Add clothes', to: '/wardrobe' },
                }}
                onRetry={onRetry}
              />
            </div>
          ) : null}

          {outfits && outfits.length > 0 ? (
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">
                  {outfits.length} outfit{outfits.length === 1 ? '' : 's'} ready
                </h3>
                {elapsedMs != null ? (
                  <p className="text-xs font-medium text-muted">
                    created in {(elapsedMs / 1000).toFixed(1)}s
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {outfits.map((outfit, index) => (
                  <OutfitCard
                    key={outfit.id}
                    outfit={outfit}
                    index={index}
                    tryOnUrl={outfit.tryOnUrl}
                    saved={savedIds.has(outfit.id)}
                    onTryOn={() => openTryOn(outfit)}
                    onSwap={() => onOpenSwap(outfit)}
                    onSave={() => onSave(outfit)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {outfits && outfits.length > 0 && (machine.phase === 'results' || machine.phase === 'partial') ? (
            <section className="mt-5 rounded-xl border border-line bg-surface p-4 shadow-sm">
              <p className="text-sm font-semibold text-ink">Not quite right?</p>
              <p className="mt-1 text-xs text-muted">
                Tell us what to change and we'll suggest a fresh set using your comment.
              </p>
              {feedbackHistory.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {feedbackHistory.map((entry) => (
                    <span
                      key={entry.id}
                      className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-muted"
                    >
                      You said: {entry.text}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {FEEDBACK_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    disabled={busy}
                    onClick={() => refineWithFeedback(suggestion.text)}
                    className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-navy/40 disabled:opacity-50"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  refineWithFeedback(feedbackText)
                }}
              >
                <input
                  value={feedbackText}
                  onChange={(event) => setFeedbackText(event.target.value)}
                  disabled={busy}
                  placeholder="e.g. I don't like the jacket, it's too bulky"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition focus:border-navy disabled:opacity-50"
                />
                <Button type="submit" disabled={busy || !feedbackText.trim()}>
                  Refine
                </Button>
              </form>
            </section>
          ) : null}

          {!busy && machine.phase === 'idle' && outfits === null ? (
            <div className="rounded-xl border border-dashed border-line bg-surface px-5 py-16 text-center">
              <p className="text-sm font-semibold text-ink">Your next outfit starts here</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                Choose where you’re going, optionally set a style, then press Create outfits.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {machine.overlay === 'swap' && activeOutfit ? (
        <SwapDrawer
          outfit={activeOutfit}
          slot={machine.activeSlot}
          items={closetItems}
          onSelectSlot={(slot) => emit({ type: 'OPEN_SWAP', outfitId: activeOutfit.id, slot })}
          onSwap={applySwap}
          onClose={() => emit({ type: 'CLOSE_OVERLAY' })}
        />
      ) : null}

      {machine.overlay === 'tryOn' && activeOutfit ? (
        <TryOnDrawer
          outfit={activeOutfit}
          status={tryOnStatus}
          elapsedSec={tryOnElapsed}
          tryOnUrl={tryOnUrl}
          error={tryOnError}
          beforeUrl={bodyPhotoUrl}
          hasBodyPhoto={hasBodyPhoto === true}
          onStart={() => void startTryOn()}
          onRetry={() => void startTryOn()}
          onSave={() => onSave(activeOutfit)}
          onClose={() => {
            abortRef.current?.abort()
            emit({ type: 'CLOSE_OVERLAY' })
          }}
        />
      ) : null}
    </StudioShell>
  )
}

function ContextChip({
  children,
  selected,
  disabled,
  onClick,
}: {
  children: ReactNode
  selected: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
        selected
          ? 'border-navy bg-navy text-white'
          : 'border-line bg-canvas text-ink hover:border-navy/40'
      }`}
    >
      {children}
    </button>
  )
}
