import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { friendlyError, getProfile, getVenues, recommend } from '../api/client'
import { Button } from '../components/Button'
import { ErrorNote } from '../components/ErrorNote'
import { OutfitCard } from '../components/OutfitCard'
import { PageHeader } from '../components/PageHeader'
import { Spinner } from '../components/Spinner'
import { SuggestSelect } from '../components/SuggestSelect'
import { FALLBACK_VENUES, STYLE_OPTIONS } from '../constants'
import type { Outfit, VenueInfo } from '../types'

export function Recommend() {
  const [params, setParams] = useSearchParams()
  const venueFromUrl = params.get('venue') ?? ''

  const [venues, setVenues] = useState<VenueInfo[]>(FALLBACK_VENUES)
  const [venue, setVenue] = useState(venueFromUrl)
  const [styleOverride, setStyleOverride] = useState('')
  const [outfits, setOutfits] = useState<Outfit[] | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [hasBodyPhoto, setHasBodyPhoto] = useState<boolean | null>(null)

  useEffect(() => {
    document.title = 'Generate — USTyle'
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
        /* keep fallback copy */
      }
      try {
        const profile = await getProfile()
        if (!cancelled) setHasBodyPhoto(Boolean(profile.bodyPhotoUrl))
      } catch {
        if (!cancelled) setHasBodyPhoto(null)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const id = window.setInterval(() => setTick((Date.now() - started) / 1000), 150)
    return () => window.clearInterval(id)
  }, [busy])

  const selectedVenue = useMemo(
    () => venues.find((entry) => entry.id === venue),
    [venues, venue],
  )

  function pickVenue(id: string) {
    setVenue(id)
    setParams(id ? { venue: id } : {}, { replace: true })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!venue) {
      setError('Select a venue first.')
      return
    }
    setError(null)
    setWarning(null)
    setOutfits(null)
    setElapsedMs(null)
    setBusy(true)
    setTick(0)
    try {
      const payload: { venue: string; preferredStyle?: string } = { venue }
      if (styleOverride) payload.preferredStyle = styleOverride
      const result = await recommend(payload)
      setOutfits(result.outfits)
      setElapsedMs(result.elapsedMs)
      setWarning(result.warning ?? null)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Generate outfits"
        description="Pick a venue. The matcher scores 2–3 looks from your wardrobe, then you can run virtual try-on."
      />

      {hasBodyPhoto === false ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No body photo yet.{' '}
          <Link to="/profile" className="font-semibold underline">
            Add one in Profile
          </Link>{' '}
          to enable virtual try-on. Matching still works without it.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        <form
          onSubmit={onSubmit}
          className="h-fit rounded-xl border border-line bg-surface p-5 shadow-sm lg:col-span-4"
        >
          <p className="text-sm font-semibold text-ink">Run</p>
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-muted">Venue</legend>
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
              Style override
            </label>
            <div className="mt-1.5">
              <SuggestSelect
                id="styleOverride"
                name="preferredStyle"
                value={styleOverride}
                options={STYLE_OPTIONS}
                placeholder="Use profile default"
                customPlaceholder="e.g. dark academia, preppy, Y2K"
                customHint="Leave on default to use Profile. Custom words are a soft hint."
                onChange={setStyleOverride}
                disabled={busy}
              />
            </div>
          </div>

          <div className="mt-6">
            <Button type="submit" className="w-full" disabled={busy || !venue}>
              {busy ? `Matching · ${tick.toFixed(0)}s` : 'Generate'}
            </Button>
            <p className="mt-2 text-xs text-muted">
              {selectedVenue ? `Target: ${selectedVenue.label}` : 'Select a venue to continue.'}
            </p>
          </div>
        </form>

        <div className="lg:col-span-8">
          {busy ? (
            <div className="rounded-xl border border-line bg-surface px-5 py-8 shadow-sm">
              <Spinner label="Scoring outfits from your wardrobe…" />
              <p className="mt-2 text-xs text-muted">{tick.toFixed(1)}s elapsed</p>
            </div>
          ) : null}

          {error ? (
            <div className="space-y-3">
              <ErrorNote title="Could not generate outfits" message={error} />
              <Link to="/wardrobe" className="inline-block text-sm font-semibold text-navy hover:underline">
                Open wardrobe
              </Link>
            </div>
          ) : null}

          {warning ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {warning}
            </p>
          ) : null}

          {outfits && outfits.length > 0 ? (
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">Results</h3>
                {elapsedMs != null ? (
                  <p className="text-xs font-medium text-muted">{(elapsedMs / 1000).toFixed(1)}s</p>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {outfits.map((outfit, index) => (
                  <OutfitCard key={outfit.id} outfit={outfit} index={index} />
                ))}
              </div>
            </section>
          ) : null}

          {outfits && outfits.length === 0 && !busy ? (
            <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-10 text-sm text-muted">
              No outfits returned.{' '}
              <Link to="/wardrobe" className="font-semibold text-navy hover:underline">
                Add more wardrobe items
              </Link>
              .
            </p>
          ) : null}

          {!busy && !error && outfits === null ? (
            <div className="rounded-xl border border-dashed border-line bg-surface px-5 py-16 text-center">
              <p className="text-sm font-semibold text-ink">No run yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                Choose a venue on the left and click Generate. Results appear here with scores and try-on.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
