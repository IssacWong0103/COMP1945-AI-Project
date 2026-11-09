import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  TryOnRequestError,
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
import { FALLBACK_VENUES, STYLE_OPTIONS } from '../constants'
import { track } from '../lib/analytics'
import {
  listLocalSavedLooks,
  pushActivity,
  pushAlert,
  saveLocalLook,
} from '../lib/activityStore'
import { primaryCtaLabel } from '../studio/actionLayout'
import { mapApiErrorToRecovery, resolveRecovery, type RecoverySpec } from '../studio/recovery'
import {
  creatingStatusCopy,
  offersLocalPreview,
  partialResultsCopy,
  tryOnFailureCopy,
  tryOnResultEvent,
} from '../studio/studioCopy'
import {
  INITIAL_STUDIO_STATE,
  reduceStudioState,
  type StudioEvent,
} from '../studio/stateMachine'
import type { Outfit, SearchMode, StudioRunStatus, TryOnFallbackReason, VenueInfo, WardrobeItem } from '../types'

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
  const [searchMode, setSearchMode] = useState<SearchMode | null>(null)
  const [runStatus, setRunStatus] = useState<StudioRunStatus | null>(null)
  const [runRecovery, setRunRecovery] = useState<RecoverySpec | null>(null)
  const [inflightOutfitId, setInflightOutfitId] = useState<string | null>(null)
  const [tryOnFailure, setTryOnFailure] = useState<{
    outfitId: string
    title: string
    message: string
    fallbackReason: TryOnFallbackReason | null
    offerPreview: boolean
  } | null>(null)
  const [tryOnElapsed, setTryOnElapsed] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const tryOnSeq = useRef(0)

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
    if (!inflightOutfitId) return
    const started = Date.now()
    const id = window.setInterval(() => setTryOnElapsed((Date.now() - started) / 1000), 200)
    return () => window.clearInterval(id)
  }, [inflightOutfitId])

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
    emit({ type: 'EDIT_INPUTS' })
  }

  async function runCreate() {
    if (!venue) {
      emit({ type: 'SUBMIT_INVALID' })
      return
    }
    emit({ type: 'SUBMIT_VALID' })
    setOutfits(null)
    setElapsedMs(null)
    setTick(0)
    setSearchMode(null)
    setRunStatus(null)
    setRunRecovery(null)
    track('studio_run_started', { venue, style: styleOverride || null })
    pushActivity({
      kind: 'run_started',
      title: 'Studio run started',
      detail: selectedVenue?.label ?? venue,
      href: '/studio',
    })
    try {
      const payload: { venue: string; preferredStyle?: string } = { venue }
      if (styleOverride) payload.preferredStyle = styleOverride
      const result = await recommend(payload)
      setOutfits(result.outfits)
      setElapsedMs(result.elapsedMs)
      setSearchMode(result.searchMode ?? null)
      setRunStatus(result.runStatus ?? null)
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
        const message = 'No outfits returned. Add more wardrobe items and retry.'
        setRunRecovery({
          kind: 'failure',
          title: "Couldn't create outfits",
          message,
          primary: { id: 'retry', label: 'Retry' },
          secondary: { id: 'openCloset', label: 'Open closet', to: '/wardrobe' },
        })
        emit({
          type: 'RUN_FAILURE',
          message,
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
      const status = err instanceof ApiError ? err.status : err instanceof TypeError ? 0 : 500
      const message = friendlyError(err)
      const spec = mapApiErrorToRecovery(status, message, {
        source: status === 0 || err instanceof TypeError ? 'connection' : 'recommend',
        fallbackReason: err instanceof ApiError ? err.fallbackReason : null,
        tryOnStatus: err instanceof ApiError ? err.tryOnStatus : null,
        resultKind: err instanceof ApiError ? err.resultKind : null,
      })
      setRunRecovery(spec)
      emit({ type: 'RUN_FAILURE', message: spec.message })
      track('studio_run_failed', { reason: spec.message })
      pushActivity({ kind: 'run_failed', title: spec.title, detail: spec.message, href: '/studio' })
      pushAlert({
        severity: spec.kind === 'offline' ? 'error' : 'warning',
        title: spec.title,
        detail: spec.message,
        href: spec.kind === 'offline' ? '/alerts' : '/studio',
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

  function onSave(outfit: Outfit) {
    const kind = outfit.tryOnResultKind
    const useTryOnImage =
      (kind === 'generated' || kind === 'collage') && Boolean(outfit.tryOnUrl)
    saveLocalLook({
      id: outfit.id,
      venue,
      overallScore: outfit.overallScore,
      createdAt: new Date().toISOString(),
      thumbnailUrl: useTryOnImage ? outfit.tryOnUrl : (outfit.items[0]?.imageUrl ?? null),
      thumbnailResultKind: useTryOnImage ? kind : null,
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
    if (inflightOutfitId === activeOutfit.id) {
      tryOnSeq.current += 1
      abortRef.current?.abort()
      setInflightOutfitId(null)
    }
    setOutfits((prev) =>
      (prev ?? []).map((outfit) => {
        if (outfit.id !== activeOutfit.id) return outfit
        return {
          ...outfit,
          tryOnUrl: null,
          tryOnResultKind: null,
          tryOnFallbackReason: null,
          tryOnDetail: null,
          tryOnStyleReferenceUrl: null,
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
    setTryOnFailure((current) => (current?.outfitId === activeOutfit.id ? null : current))
    emit({ type: 'CLOSE_OVERLAY' })
  }

  function failureFromTryOn(err: unknown): {
    title: string
    message: string
    fallbackReason: TryOnFallbackReason | null
    offerPreview: boolean
  } {
    if (err instanceof TypeError) {
      const offline = mapApiErrorToRecovery(0, friendlyError(err), { source: 'connection' })
      return {
        title: offline.title,
        message: offline.message,
        fallbackReason: null,
        offerPreview: false,
      }
    }
    if (err instanceof ApiError) {
      const spec = mapApiErrorToRecovery(err.status, err.message, {
        source: 'tryon',
        fallbackReason: err.fallbackReason,
        tryOnStatus: err.tryOnStatus ?? 'failed',
        resultKind: err.resultKind,
      })
      if (spec.kind === 'offline') {
        return {
          title: spec.title,
          message: spec.message,
          fallbackReason: null,
          offerPreview: false,
        }
      }
      const copy = tryOnFailureCopy(err.fallbackReason, err.message)
      const preview =
        err instanceof TryOnRequestError
          ? err.offerPreview
          : offersLocalPreview(err.fallbackReason) ||
            /try-on provider|local preview/i.test(err.message)
      return {
        title: err.fallbackReason ? copy.title : spec.title,
        message: err.fallbackReason ? copy.message : spec.message,
        fallbackReason: err.fallbackReason,
        offerPreview: preview,
      }
    }
    return {
      title: "The try-on didn't finish.",
      message: friendlyError(err),
      fallbackReason: null,
      offerPreview: false,
    }
  }

  async function startTryOn(acceptPreview = false) {
    if (!activeOutfit) return
    if (!bodyPhotoUrl) return
    const outfitId = activeOutfit.id
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const seq = ++tryOnSeq.current
    setInflightOutfitId(outfitId)
    setTryOnFailure((current) => (current?.outfitId === outfitId ? null : current))
    setTryOnElapsed(0)
    if (!acceptPreview) {
      track('studio_tryon_started', { outfitId })
      pushActivity({
        kind: 'tryon_started',
        title: 'Try-on started',
        detail: selectedVenue?.label ?? venue,
        href: '/try-on',
      })
    }
    try {
      const result = await pollTryOn(outfitId, {
        signal: ctrl.signal,
        acceptPreview,
      })
      if (tryOnSeq.current !== seq) return
      const kind = result.resultKind === 'collage' || result.resultKind === 'generated' ? result.resultKind : null
      if (!kind || !result.tryOnUrl || (kind === 'collage' && !acceptPreview)) {
        throw new TryOnRequestError(
          result.detail?.trim() || 'This image is a local preview, not a generated try-on.',
          200,
          {
            fallbackReason: result.fallbackReason ?? null,
            tryOnStatus: 'failed',
            resultKind: kind,
            offerPreview: true,
          },
        )
      }
      setOutfits((prev) =>
        (prev ?? []).map((outfit) =>
          outfit.id === outfitId
            ? {
                ...outfit,
                tryOnUrl: result.tryOnUrl,
                tryOnResultKind: kind,
                tryOnFallbackReason: result.fallbackReason ?? null,
                tryOnDetail: result.detail ?? null,
                tryOnStyleReferenceUrl: result.styleReferenceUrl ?? outfit.tryOnStyleReferenceUrl ?? null,
              }
            : outfit,
        ),
      )
      setInflightOutfitId((current) => (current === outfitId ? null : current))
      const event = tryOnResultEvent(kind)
      if (event === 'studio_tryon_ready') {
        track(event, { outfitId, resultKind: 'generated' })
        pushActivity({
          kind: 'tryon_ready',
          title: 'Try-on ready',
          href: '/try-on',
        })
      } else {
        track('studio_tryon_preview', {
          outfitId,
          resultKind: 'collage',
          fallbackReason: result.fallbackReason ?? null,
        })
        pushActivity({
          kind: 'tryon_preview',
          title: 'Local preview',
          detail: 'This is a preview, not a generated try-on.',
          href: '/try-on',
        })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (tryOnSeq.current !== seq) return
      const info = failureFromTryOn(err)
      setInflightOutfitId((current) => (current === outfitId ? null : current))
      setTryOnFailure({ outfitId, ...info })
      track('studio_tryon_failed', {
        outfitId,
        reason: info.message,
        fallbackReason: info.fallbackReason,
      })
      pushActivity({
        kind: 'tryon_failed',
        title: info.title,
        detail: info.message,
        href: '/try-on',
      })
      pushAlert({
        severity: 'error',
        title: info.title,
        detail: info.message,
        href: '/try-on',
      })
    }
  }

  function openTryOn(outfit: Outfit) {
    emit({ type: 'OPEN_TRY_ON', outfitId: outfit.id })
  }

  function drawerStatus(outfit: Outfit): TryOnDrawerStatus {
    if (inflightOutfitId === outfit.id) return 'rendering'
    if (tryOnFailure?.outfitId === outfit.id) return 'failed'
    if (outfit.tryOnResultKind === 'generated' && outfit.tryOnUrl) return 'ready-generated'
    if (outfit.tryOnResultKind === 'collage' && outfit.tryOnUrl) return 'ready-collage'
    return 'idle'
  }

  const busy = machine.phase === 'creating'

  return (
    <StudioShell activeTab="create">
      {recovery &&
      machine.phase !== 'creating' &&
      machine.phase !== 'results' &&
      machine.phase !== 'failure' &&
      machine.phase !== 'partial' ? (
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
                    disabled={busy}
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
                Using closet of {closetItems.length} pieces. Weather and color mood can be added when
                the studio/swaps API ships — style + venue drive matching today.
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
            <div className="rounded-xl border border-line bg-surface px-5 py-8 shadow-sm" aria-busy="true">
              <Spinner
                label={creatingStatusCopy({ searchMode, runStatus, elapsedSec: tick })}
              />
              <p className="mt-2 text-xs text-muted">{tick.toFixed(1)}s</p>
              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="h-48 animate-pulse rounded-xl bg-canvas" />
                ))}
              </div>
            </div>
          ) : null}

          {machine.phase === 'failure' && machine.lastError ? (
            <RecoveryPanel
              recovery={
                runRecovery ?? {
                  kind: 'failure',
                  title: "Couldn't create outfits",
                  message: machine.lastError,
                  primary: { id: 'retry', label: 'Retry' },
                  secondary: { id: 'adjust', label: 'Adjust inputs' },
                }
              }
              onRetry={onRetry}
              onAdjust={() => {
                setFineTuneOpen(true)
                emit({ type: 'EDIT_INPUTS' })
              }}
            />
          ) : null}

          {machine.phase === 'partial' && machine.lastWarning ? (
            <div className="mb-4">
              <RecoveryPanel
                recovery={{
                  kind: 'partial',
                  title: 'Partial results',
                  message: partialResultsCopy(machine.lastWarning, searchMode),
                  primary: { id: 'retry', label: 'Retry missing looks' },
                  secondary: { id: 'openCloset', label: 'Add clothes', to: '/wardrobe' },
                }}
                onRetry={onRetry}
                onAdjust={() => {
                  setFineTuneOpen(true)
                  emit({ type: 'EDIT_INPUTS' })
                }}
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
                    resultKind={outfit.tryOnResultKind}
                    rendering={inflightOutfitId === outfit.id}
                    saved={savedIds.has(outfit.id)}
                    onTryOn={() => openTryOn(outfit)}
                    onSwap={() => onOpenSwap(outfit)}
                    onSave={() => onSave(outfit)}
                  />
                ))}
              </div>
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
          status={drawerStatus(activeOutfit)}
          elapsedSec={tryOnElapsed}
          tryOnUrl={activeOutfit.tryOnUrl}
          fallbackReason={activeOutfit.tryOnFallbackReason}
          detail={activeOutfit.tryOnDetail}
          errorTitle={tryOnFailure?.outfitId === activeOutfit.id ? tryOnFailure.title : null}
          errorMessage={tryOnFailure?.outfitId === activeOutfit.id ? tryOnFailure.message : null}
          offerPreview={tryOnFailure?.outfitId === activeOutfit.id ? tryOnFailure.offerPreview : false}
          beforeUrl={bodyPhotoUrl}
          onStart={() => void startTryOn(false)}
          onRetry={() => void startTryOn(false)}
          onShowPreview={() => void startTryOn(true)}
          onSave={() => onSave(activeOutfit)}
          onClose={() => emit({ type: 'CLOSE_OVERLAY' })}
        />
      ) : null}
    </StudioShell>
  )
}
