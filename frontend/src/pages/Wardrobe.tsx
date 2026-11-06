import { useEffect, useMemo, useState } from 'react'
import {
  apiUrl,
  deleteWardrobeItem,
  friendlyError,
  listWardrobeItems,
  uploadWardrobeItem,
} from '../api/client'
import { Button, ButtonLink } from '../components/Button'
import { Chip } from '../components/Chip'
import { Dropzone } from '../components/Dropzone'
import { ErrorNote } from '../components/ErrorNote'
import { PageHeader } from '../components/PageHeader'
import { Spinner } from '../components/Spinner'
import { humanize } from '../constants'
import type { WardrobeItem } from '../types'

const FILTERS = ['all', 'top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory'] as const

type UploadJob = {
  key: string
  name: string
  status: 'uploading' | 'done' | 'error'
  error?: string
}

export function Wardrobe() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')

  useEffect(() => {
    document.title = 'Wardrobe — USTyle'
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await listWardrobeItems()
        if (!cancelled) setItems(data)
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

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.category === filter)),
    [filter, items],
  )

  async function onFiles(files: File[]) {
    setError(null)
    setUploading(true)
    const queued: UploadJob[] = files.map((file, index) => ({
      key: `${file.name}-${file.size}-${index}-${Date.now()}`,
      name: file.name,
      status: 'uploading',
    }))
    setJobs(queued)

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]
      const key = queued[i].key
      try {
        const item = await uploadWardrobeItem(file)
        setItems((prev) => [item, ...prev.filter((existing) => existing.id !== item.id)])
        setJobs((prev) => prev.map((job) => (job.key === key ? { ...job, status: 'done' } : job)))
      } catch (err) {
        const message = friendlyError(err)
        setJobs((prev) =>
          prev.map((job) => (job.key === key ? { ...job, status: 'error', error: message } : job)),
        )
      }
    }

    setUploading(false)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Wardrobe"
        description="Upload photos of clothes you already own. The system tags category, colour, and style automatically."
        actions={items.length > 0 ? <ButtonLink to="/dress-me">Generate outfits</ButtonLink> : null}
      />

      <div className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <Dropzone
          id="wardrobe-upload"
          label="Upload clothing photos"
          hint="Drop files here or click to browse. Multiple files are allowed."
          multiple
          compact
          disabled={uploading}
          onFiles={(files) => void onFiles(files)}
          onInvalid={(names) => setError(`Only JPEG, PNG, or WebP. Skipped: ${names.join(', ')}`)}
        />
      </div>

      {jobs.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {jobs.map((job, index) => (
            <li
              key={job.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            >
              <span className="truncate text-ink">
                {job.status === 'uploading' ? `${index + 1}/${jobs.length} · ` : ''}
                {job.name}
              </span>
              {job.status === 'uploading' ? <Spinner label="Tagging…" /> : null}
              {job.status === 'done' ? <span className="text-xs font-medium text-success">Saved</span> : null}
              {job.status === 'error' ? <span className="text-right text-xs text-danger">{job.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                filter === value ? 'bg-navy text-white' : 'bg-surface text-muted ring-1 ring-line hover:text-ink'
              }`}
            >
              {value === 'all' ? 'All' : humanize(value)}
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-muted">
          {visible.length} {visible.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {loading ? (
        <div className="mt-10">
          <Spinner label="Loading wardrobe…" />
        </div>
      ) : null}

      {!loading && items.length === 0 && !error ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="text-sm font-semibold text-ink">No items in wardrobe</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Upload tops, bottoms, outerwear, or shoes. Matching only uses pieces you add here.
          </p>
        </div>
      ) : visible.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => (
            <WardrobeCard
              key={item.id}
              item={item}
              onDeleted={(id) => setItems((prev) => prev.filter((entry) => entry.id !== id))}
              onError={setError}
            />
          ))}
        </div>
      ) : !loading ? (
        <p className="mt-8 text-sm text-muted">No items in this category.</p>
      ) : null}
    </div>
  )
}

function WardrobeCard({
  item,
  onDeleted,
  onError,
}: {
  item: WardrobeItem
  onDeleted: (id: string) => void
  onError: (message: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try {
      await deleteWardrobeItem(item.id)
      onDeleted(item.id)
    } catch (err) {
      onError(friendlyError(err))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="relative bg-canvas">
        {item.imageUrl ? (
          <img
            src={apiUrl(item.imageUrl)}
            alt={item.description || `${humanize(item.category)} in ${item.color || 'wardrobe'}`}
            className="aspect-[4/5] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/5] items-end bg-navy p-3 text-[11px] font-medium uppercase tracking-wide text-white">
            {humanize(item.category)}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex flex-wrap gap-1">
          {item.category ? <Chip>{humanize(item.category)}</Chip> : null}
          {item.color ? <Chip>{item.color}</Chip> : null}
          {item.style ? <Chip>{humanize(item.style)}</Chip> : null}
        </div>
        {item.description ? (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{item.description}</p>
        ) : null}
        <div className="mt-3 flex items-center justify-end">
          {confirming ? (
            <div className="flex items-center gap-2">
              <Button variant="danger" disabled={busy} onClick={() => void remove()}>
                {busy ? 'Removing…' : 'Delete'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              aria-label={`Delete ${item.description || humanize(item.category) || 'item'}`}
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
