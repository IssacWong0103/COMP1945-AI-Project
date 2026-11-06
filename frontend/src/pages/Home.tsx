import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl, friendlyError, getProfile, listWardrobeItems } from '../api/client'
import { ButtonLink } from '../components/Button'
import { ErrorNote } from '../components/ErrorNote'
import { Spinner } from '../components/Spinner'
import { humanize } from '../constants'
import type { Profile, WardrobeItem } from '../types'

export function Home() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Dashboard — USTyle'
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [wardrobe, nextProfile] = await Promise.all([listWardrobeItems(), getProfile()])
        if (cancelled) return
        setItems(wardrobe)
        setProfile(nextProfile)
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
  const hasAttrs = Boolean(profile?.heightCm && profile?.preferredStyle)
  const styleLabel = profile?.preferredStyle ? humanize(profile.preferredStyle) : ''

  const checks = useMemo(
    () => [
      {
        id: 'wardrobe',
        n: 1,
        label: 'Add at least 2 wardrobe items',
        detail: 'USTyle only matches outfits from clothes you upload.',
        done: hasWardrobe,
        to: '/wardrobe',
        action: 'Open Wardrobe',
      },
      {
        id: 'photo',
        n: 2,
        label: 'Upload a full-body photo',
        detail: 'Used only for virtual try-on, never shared.',
        done: hasPhoto,
        to: '/you',
        action: 'Open Profile',
      },
      {
        id: 'profile',
        n: 3,
        label: 'Set height and preferred style',
        detail: 'Improves venue fit and sizing.',
        done: hasAttrs,
        to: '/you',
        action: 'Open Profile',
      },
    ],
    [hasWardrobe, hasPhoto, hasAttrs],
  )

  const readyCount = checks.filter((check) => check.done).length
  const allReady = readyCount === 3

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[26px] font-semibold tracking-tight text-ink">Dashboard</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Finish three quick steps and USTyle can style you from your own closet.
          </p>
        </div>
        <ButtonLink
          to="/dress-me"
          disabled={!allReady}
          className={
            allReady
              ? ''
              : 'border-0 bg-[#e8edf3] text-[#9aa3b2] shadow-none hover:bg-[#e8edf3]'
          }
        >
          Generate outfit
        </ButtonLink>
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
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Wardrobe items"
              value={String(items.length)}
              hint="Upload clothes you already own"
              muted={items.length === 0}
              badge={
                hasWardrobe
                  ? { text: 'Ready', tone: 'ok' }
                  : { text: 'Needs 2+', tone: 'warn' }
              }
            />
            <StatCard
              label="Body photo"
              value={hasPhoto ? 'Added' : 'Missing'}
              hint="Required for virtual try-on"
              muted={!hasPhoto}
              badge={hasPhoto ? { text: 'Added', tone: 'ok' } : { text: 'Not added', tone: 'warn' }}
            />
            <StatCard
              label="Profile attributes"
              value={hasAttrs ? 'Complete' : 'Incomplete'}
              hint="Height + preferred style"
              muted={!hasAttrs}
              badge={hasAttrs ? { text: 'Set', tone: 'ok' } : { text: 'Not set', tone: 'warn' }}
            />
            <StatCard
              label="Preferred style"
              value={styleLabel || 'Not set'}
              hint="Choose one in Profile"
              muted={!styleLabel}
            />
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm lg:col-span-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">Setup checklist</h3>
                  <p className="mt-0.5 text-sm text-muted">Complete these to unlock Generate.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 pt-1">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-navy transition-all"
                      style={{ width: `${(readyCount / 3) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-muted">{readyCount} of 3 done</span>
                </div>
              </div>

              <ul className="mt-2">
                {checks.map((check) => (
                  <li
                    key={check.id}
                    className="flex items-center gap-3 border-b border-line py-4 last:border-b-0 last:pb-1"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        check.done
                          ? 'bg-emerald-100 text-success'
                          : 'border border-line bg-surface text-muted'
                      }`}
                    >
                      {check.done ? '✓' : check.n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{check.label}</p>
                      <p className="mt-0.5 text-sm text-muted">{check.detail}</p>
                    </div>
                    <span
                      className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${
                        check.done ? 'bg-emerald-50 text-success' : 'bg-canvas text-muted'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${check.done ? 'bg-success' : 'bg-slate-400'}`} />
                      {check.done ? 'Done' : 'To do'}
                    </span>
                    <Link
                      to={check.to}
                      className="shrink-0 text-sm font-semibold text-navy no-underline hover:underline"
                    >
                      {check.action}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm lg:col-span-2">
              <h3 className="text-[15px] font-semibold text-ink">Quick actions</h3>
              <div className="mt-3">
                <QuickAction
                  to="/wardrobe"
                  title="Upload clothes"
                  subtitle="Add photos to Wardrobe"
                  icon={<UploadIcon />}
                />
                <QuickAction
                  to="/you"
                  title="Edit profile"
                  subtitle="Body photo, height, style"
                  icon={<PersonIcon />}
                />
                <QuickAction
                  to="/dress-me"
                  title="Generate for a venue"
                  subtitle="Lecture, career fair, date…"
                  icon={<SparkleIcon />}
                />
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Recent wardrobe</h3>
                <p className="mt-0.5 text-sm text-muted">
                  {items.length === 0 ? 'Nothing uploaded yet' : `${items.length} item${items.length === 1 ? '' : 's'} in your closet`}
                </p>
              </div>
              {items.length > 0 ? (
                <Link to="/wardrobe" className="text-sm font-semibold text-navy no-underline hover:underline">
                  View all
                </Link>
              ) : null}
            </div>

            {items.length === 0 ? (
              <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-canvas text-navy">
                  <ShirtIcon />
                </span>
                <p className="mt-4 text-[15px] font-semibold text-ink">Your closet is empty</p>
                <p className="mt-1 max-w-md text-sm text-muted">
                  Upload tops, bottoms and shoes you already own. USTyle only styles outfits from your own clothes.
                </p>
                <ButtonLink to="/wardrobe" className="mt-5 rounded-lg px-4">
                  Upload clothes
                </ButtonLink>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {items.slice(0, 6).map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-xl border border-line bg-canvas">
                    {item.imageUrl ? (
                      <img
                        src={apiUrl(item.imageUrl)}
                        alt={item.description || humanize(item.category)}
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-xs text-muted">
                        {humanize(item.category)}
                      </div>
                    )}
                    <p className="truncate px-2 py-1.5 text-[11px] text-muted">{humanize(item.category)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  badge,
  muted = false,
}: {
  label: string
  value: string
  hint: string
  badge?: { text: string; tone: 'warn' | 'ok' }
  muted?: boolean
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-2 text-[28px] font-semibold leading-none tracking-tight ${muted ? 'text-slate-400' : 'text-ink'}`}>
        {value}
      </p>
      <p className="mt-2 text-sm text-muted">{hint}</p>
      {badge ? (
        <span
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            badge.tone === 'ok' ? 'bg-emerald-50 text-success' : 'bg-[#f8f0d8] text-[#b45309]'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${badge.tone === 'ok' ? 'bg-success' : 'bg-[#e8b931]'}`} />
          {badge.text}
        </span>
      ) : null}
    </div>
  )
}

function QuickAction({
  to,
  title,
  subtitle,
  icon,
}: {
  to: string
  title: string
  subtitle: string
  icon: ReactNode
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl px-1 py-3 text-ink no-underline transition hover:bg-canvas"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas text-navy">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-sm text-muted">{subtitle}</span>
      </span>
      <ChevronIcon />
    </Link>
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

function PersonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <circle cx="10" cy="7" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 16c.7-2.4 2.5-3.6 5-3.6s4.3 1.2 5 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M10 3.4 11 7.1 14.8 8.2 11 9.3 10 13 9 9.3 5.2 8.2 9 7.1 10 3.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M14.8 12.2v2.8M13.4 13.6h2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-400" fill="none" aria-hidden>
      <path d="M8 5.5 12.5 10 8 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShirtIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
      <path
        d="M8 7.2 12 10l4-2.8M7 9.5h10v10.2H7z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10v9.7" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
