import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl, friendlyError, getProfile, listSavedLooks, listWardrobeItems } from '../api/client'
import { ButtonLink } from '../components/Button'
import { ErrorNote } from '../components/ErrorNote'
import { Spinner } from '../components/Spinner'
import { FALLBACK_VENUES, humanize, itemTitle } from '../constants'
import type { Profile, SavedLook, WardrobeItem } from '../types'

const HERO_SAMPLES = [
  { src: '/home/shirt.svg', alt: 'White shirt' },
  { src: '/home/pants.svg', alt: 'Beige trousers' },
  { src: '/home/shoes.svg', alt: 'White sneakers' },
] as const

const VENUE_ICONS: Record<string, () => ReactNode> = {
  lecture: LectureIcon,
  careerFair: BriefcaseIcon,
  casualDate: CoffeeIcon,
  hallGathering: PeopleIcon,
  formal: SparkleIcon,
}

export function Home() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [looks, setLooks] = useState<SavedLook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Home — USTyle'
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [wardrobe, nextProfile] = await Promise.all([listWardrobeItems(), getProfile()])
        if (cancelled) return
        setItems(wardrobe)
        setProfile(nextProfile)
        try {
          const saved = await listSavedLooks()
          if (!cancelled) setLooks(saved)
        } catch {
          if (!cancelled) setLooks([])
        }
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

  const hasWardrobe = items.length >= 2
  const hasPhoto = Boolean(profile?.bodyPhotoUrl)
  const hasFacePhoto = Boolean(profile?.facePhotoUrl)
  const hasAttrs = Boolean(profile?.heightCm && profile?.preferredStyle)
  const setupComplete = hasWardrobe && hasPhoto && hasAttrs
  const filledCount = [profile?.heightCm, profile?.weightKg, profile?.gender, profile?.skinTone, profile?.preferredStyle].filter(
    (value) => value !== null && value !== undefined && String(value).trim() !== '',
  ).length
  const pieceLabel = items.length === 1 ? '1 piece' : `${items.length} pieces`
  const greeting = useMemo(() => timeGreeting(), [])
  const createHint = !hasWardrobe ? 'Add clothes first' : !hasPhoto ? 'Add a body photo first' : 'Finish profile first'

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-[28px] font-semibold tracking-tight text-navy">Home</h1>
        {loading ? null : setupComplete ? (
          <ButtonLink to="/studio" className="whitespace-nowrap rounded-full px-4">
            <PlusIcon />
            Create outfit
          </ButtonLink>
        ) : (
          <div className="flex flex-col items-end">
            <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-[#e7edf3] px-4 py-2 text-sm font-semibold text-[#9aa3b2]">
              <PlusIcon />
              Create outfit
            </span>
            <p className="mt-1 text-[11px] text-muted">{createHint}</p>
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-6">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {loading ? (
        <div className="mt-10">
          <Spinner label="Loading workspace…" />
        </div>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-[28px] font-semibold tracking-tight text-navy">{greeting}</h2>
            <p className="mt-1 text-sm text-muted">
              {setupComplete
                ? `Your closet has ${pieceLabel}. A good day starts with one less decision.`
                : `Your closet has ${pieceLabel}. Let's make getting dressed a little easier.`}
            </p>
          </section>

          {setupComplete ? <ReadyHero /> : <StartClosetHero />}

          {setupComplete ? null : (
            <ol className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <span className="pointer-events-none absolute top-3.5 right-[12%] left-[12%] hidden h-px bg-line sm:block" aria-hidden />
              <SetupStep n={1} label="At least 2 wardrobe items" done={hasWardrobe} />
              <SetupStep n={2} label="Full-body photo" done={hasPhoto} />
              <SetupStep n={3} label="Face close-up (recommended)" done={hasFacePhoto} optional />
              <SetupStep n={4} label="Height + preferred style" done={hasAttrs} />
            </ol>
          )}

          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatusCard to="/wardrobe" icon={<ShirtIcon />} label="Closet" value={pieceLabel} />
            <StatusCard
              to="/settings"
              icon={<ScanIcon />}
              label="Try-on photos"
              value={hasPhoto && hasFacePhoto ? 'Body + face ready' : hasPhoto ? 'Body only' : 'Not added'}
            />
            <StatusCard to="/settings" icon={<PersonIcon />} label="Settings" value={`${filledCount} of 5 filled`} />
            <StatusCard
              to="/settings"
              icon={<SlidersIcon />}
              label="Preferred style"
              value={profile?.preferredStyle ? humanize(profile.preferredStyle) : 'Not set'}
            />
          </section>

          <section className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[17px] font-semibold text-navy">Recent closet</h3>
              {items.length > 0 ? (
                <Link to="/wardrobe" className="text-sm font-semibold text-navy no-underline hover:underline">
                  View all
                </Link>
              ) : null}
            </div>

            {items.length === 0 ? (
              <div className="mt-3 flex min-h-[220px] items-center justify-center rounded-2xl border border-line bg-surface px-6 py-14 shadow-sm">
                <div className="flex items-center gap-4 text-left">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#eef2f7] text-navy">
                    <ShirtIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-ink">Nothing here yet</p>
                    <p className="mt-1 text-sm text-muted">Your everyday favourites belong here.</p>
                    <Link to="/wardrobe" className="mt-2 inline-block text-sm font-semibold text-navy no-underline hover:underline">
                      Upload photos
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
                {items.slice(0, 6).map((item) => (
                  <Link key={item.id} to="/wardrobe" className="min-w-0 no-underline">
                    <div className="overflow-hidden rounded-xl bg-[#ddd3c4]">
                      {item.imageUrl ? (
                        <img
                          src={apiUrl(item.imageUrl)}
                          alt={itemTitle(item)}
                          className="aspect-[4/5] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/5] items-center justify-center text-xs text-muted">
                          {humanize(item.category)}
                        </div>
                      )}
                    </div>
                    <p className="mt-2 truncate text-[13px] text-ink">{itemTitle(item)}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {setupComplete && looks.length > 0 ? (
            <section className="mt-8">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[17px] font-semibold text-navy">Saved looks</h3>
                <Link to="/studio" className="text-sm font-semibold text-navy no-underline hover:underline">
                  View all
                </Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {looks.map((look) => (
                  <Link
                    key={look.id}
                    to={`/studio?venue=${encodeURIComponent(look.venue)}`}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3 no-underline shadow-sm transition hover:border-navy/20"
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#ddd3c4]">
                      {look.thumbnailUrl ? (
                        <img src={apiUrl(look.thumbnailUrl)} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {humanize(look.venue)}
                        {profile?.preferredStyle ? ` · ${humanize(profile.preferredStyle)}` : ''}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {Math.round(look.overallScore * 100)}% match · {formatLookDate(look.createdAt)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function StartClosetHero() {
  return (
    <section className="mt-6 flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-lg">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-gold-deep">A SMALL START</p>
        <h3 className="mt-2 text-[26px] font-semibold tracking-tight text-navy">Start your closet</h3>
        <p className="mt-2 text-sm text-muted">Upload photos of tops, bottoms and shoes you already own.</p>
        <ButtonLink to="/wardrobe" className="mt-5 whitespace-nowrap rounded-xl px-4">
          <UploadIcon />
          Upload clothes
        </ButtonLink>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {HERO_SAMPLES.map((sample) => (
          <img
            key={sample.src}
            src={sample.src}
            alt={sample.alt}
            className="h-[132px] w-[108px] rounded-xl object-cover shadow-sm"
          />
        ))}
      </div>
    </section>
  )
}

function ReadyHero() {
  return (
    <section className="relative mt-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-gold-deep">YOUR CLOTHES. A FRESH COMBINATION.</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[26px] font-semibold tracking-tight text-navy">Where are you headed today?</h3>
          <p className="mt-1 text-sm text-muted">Choose an occasion. We&apos;ll put your own pieces together.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-success">
          <CheckMiniIcon />
          Setup complete
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {FALLBACK_VENUES.map((venue) => {
          const Icon = VENUE_ICONS[venue.id] ?? SparkleIcon
          return (
            <Link
              key={venue.id}
              to={`/studio?venue=${encodeURIComponent(venue.id)}`}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-3 text-sm font-medium text-ink no-underline transition hover:border-navy/30 hover:bg-canvas"
            >
              <span className="text-navy">
                <Icon />
              </span>
              <span className="min-w-0 flex-1 truncate">{venue.label}</span>
              <ArrowUpRightIcon />
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function SetupStep({ n, label, done, optional }: { n: number; label: string; done: boolean; optional?: boolean }) {
  return (
    <li className="relative flex flex-col items-center text-center">
      <span
        className={`relative z-[1] flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
          done
            ? 'bg-navy text-white'
            : optional
              ? 'border border-dashed border-line bg-surface text-muted'
              : 'border border-line bg-surface text-muted'
        }`}
      >
        {done ? '✓' : n}
      </span>
      <p className="mt-2 text-xs text-muted sm:text-sm">{label}</p>
    </li>
  )
}

function StatusCard({ to, icon, label, value }: { to: string; icon: ReactNode; label: string; value: string }) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-4 no-underline shadow-sm transition hover:border-navy/20"
    >
      <span className="mt-0.5 text-navy">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm text-navy">{label}</span>
        <span className="mt-0.5 block text-sm font-semibold text-ink">{value}</span>
      </span>
    </Link>
  )
}

function timeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning.'
  if (hour < 18) return 'Good afternoon.'
  return 'Good evening.'
}

function formatLookDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M10 13.5V4.8M10 4.8 7.2 7.5M10 4.8 12.8 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 13.2v2.3A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5v-2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ShirtIcon({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
      <path
        d="M7.2 4.8 10 7.2 12.8 4.8 16 7.1v8.7H4V7.1L7.2 4.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 7.2v8.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M4.5 7V5.2A1.2 1.2 0 0 1 5.7 4h1.8M15.5 7V5.2A1.2 1.2 0 0 0 14.3 4h-1.8M4.5 13v1.8A1.2 1.2 0 0 0 5.7 16h1.8M15.5 13v1.8a1.2 1.2 0 0 1-1.2 1.2h-1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7.4 8.2 10 10.2l2.6-2M8.2 12.4h3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <circle cx="10" cy="7.2" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.8 16c.7-2.5 2.6-3.8 5.2-3.8s4.5 1.3 5.2 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M4 6.5h12M4 13.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="6.5" r="1.8" fill="currentColor" />
      <circle cx="12.5" cy="13.5" r="1.8" fill="currentColor" />
    </svg>
  )
}

function CheckMiniIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.2 8.1 7.1 10l3.7-4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowUpRightIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" aria-hidden>
      <path d="M5 11 11 5M6.5 5H11v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LectureIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M3.5 9.2 10 5.8 16.5 9.2 10 12.6 3.5 9.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.2 10.8v3.2L10 16l3.8-2V10.8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <rect x="3.2" y="6.5" width="13.6" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 6.5V5.4A1.4 1.4 0 0 1 8.9 4h2.2A1.4 1.4 0 0 1 12.5 5.4v1.1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function CoffeeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M5 8h8v5.2A2.8 2.8 0 0 1 10.2 16H7.8A2.8 2.8 0 0 1 5 13.2V8Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 9.2h1.4A1.8 1.8 0 0 1 16.2 11 1.8 1.8 0 0 1 14.4 12.8H13" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.6c.2.7-.2 1.2-.2 1.8M11 4.6c.2.7-.2 1.2-.2 1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <circle cx="7.2" cy="7.2" r="2.1" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13.2" cy="7.6" r="1.7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.6 15.4c.6-2.2 2.2-3.3 4.4-3.3 2.2 0 3.8 1.1 4.4 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.2 12.4c1.5 0 2.7.7 3.3 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M10 3.4 11 7.1 14.8 8.2 11 9.3 10 13 9 9.3 5.2 8.2 9 7.1 10 3.4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M14.8 12.2v2.8M13.4 13.6h2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
