import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl, friendlyError, getProfile, listWardrobeItems } from '../api/client'
import { ButtonLink } from '../components/Button'
import { ErrorNote } from '../components/ErrorNote'
import { PageHeader } from '../components/PageHeader'
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

  const checks = useMemo(() => {
    const hasWardrobe = items.length >= 2
    const hasPhoto = Boolean(profile?.bodyPhotoUrl)
    const hasAttrs = Boolean(profile?.heightCm && profile?.preferredStyle)
    return [
      {
        id: 'wardrobe',
        label: 'Add at least 2 wardrobe items',
        done: hasWardrobe,
        to: '/wardrobe',
        meta: `${items.length} uploaded`,
      },
      {
        id: 'photo',
        label: 'Upload a full-body photo',
        done: hasPhoto,
        to: '/you',
        meta: hasPhoto ? 'Ready for try-on' : 'Required for try-on',
      },
      {
        id: 'profile',
        label: 'Complete height and style',
        done: hasAttrs,
        to: '/you',
        meta: hasAttrs ? 'Saved' : 'Improves matching',
      },
    ]
  }, [items.length, profile])

  const readyCount = checks.filter((check) => check.done).length
  const canGenerate = items.length > 0

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dashboard"
        description="Manage your closet, set a profile, then generate outfits for a campus venue."
        actions={
          <ButtonLink to="/dress-me" disabled={!canGenerate}>
            Generate outfit
          </ButtonLink>
        }
      />

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
          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Wardrobe items" value={String(items.length)} hint="Photos tagged in your closet" />
            <StatCard
              label="Setup complete"
              value={`${readyCount}/3`}
              hint="Items needed before a full try-on"
            />
            <StatCard
              label="Preferred style"
              value={profile?.preferredStyle ? humanize(profile.preferredStyle) : 'Not set'}
              hint="Used when generating looks"
            />
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-5">
            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm lg:col-span-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">Setup checklist</h3>
                <span className="text-xs font-medium text-muted">{readyCount} of 3 done</span>
              </div>
              <ul className="mt-4 divide-y divide-line">
                {checks.map((check) => (
                  <li key={check.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          check.done ? 'bg-emerald-100 text-success' : 'bg-canvas text-muted'
                        }`}
                      >
                        {check.done ? '✓' : ''}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{check.label}</p>
                        <p className="text-xs text-muted">{check.meta}</p>
                      </div>
                    </div>
                    <Link
                      to={check.to}
                      className="shrink-0 text-sm font-semibold text-navy no-underline hover:underline"
                    >
                      {check.done ? 'Edit' : 'Set up'}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm lg:col-span-2">
              <h3 className="text-sm font-semibold text-ink">Quick actions</h3>
              <div className="mt-4 flex flex-col gap-2">
                <ButtonLink to="/wardrobe" variant="secondary" className="w-full justify-start">
                  Upload clothes
                </ButtonLink>
                <ButtonLink to="/you" variant="secondary" className="w-full justify-start">
                  Edit profile
                </ButtonLink>
                <ButtonLink to="/dress-me" className="w-full justify-start" disabled={!canGenerate}>
                  Generate for a venue
                </ButtonLink>
              </div>
              {!canGenerate ? (
                <p className="mt-3 text-xs text-muted">Add wardrobe photos before generating outfits.</p>
              ) : null}
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">Recent wardrobe</h3>
              <Link to="/wardrobe" className="text-sm font-semibold text-navy no-underline hover:underline">
                View all
              </Link>
            </div>
            {items.length === 0 ? (
              <p className="mt-6 text-sm text-muted">No items yet. Upload photos of clothes you already own.</p>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {items.slice(0, 6).map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-lg border border-line bg-canvas">
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

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  )
}
