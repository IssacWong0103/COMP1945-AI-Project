import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  apiUrl,
  deleteWardrobeItem,
  friendlyError,
  listWardrobeItems,
  updateWardrobeItem,
  uploadWardrobeItem,
} from '../api/client'
import { Button, ButtonLink } from '../components/Button'
import { Dropzone } from '../components/Dropzone'
import { ErrorNote } from '../components/ErrorNote'
import { Spinner } from '../components/Spinner'
import {
  CATEGORY_OPTIONS,
  CUT_SUGGESTIONS,
  ITEM_GENDER_OPTIONS,
  STYLE_OPTIONS,
  humanize,
  itemTitle,
} from '../constants'
import type { WardrobeItem } from '../types'

const FILTERS = ['all', 'top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory'] as const

const FILTER_LABELS: Record<(typeof FILTERS)[number], string> = {
  all: 'All',
  top: 'Top',
  bottom: 'Bottom',
  outerwear: 'Outerwear',
  dress: 'Dress',
  shoes: 'Shoes',
  accessory: 'Accessory',
}

const UPLOAD_TYPES = [
  { key: 'tops', label: 'Tops', icon: TopIcon },
  { key: 'bottoms', label: 'Bottoms', icon: BottomIcon },
  { key: 'shoes', label: 'Shoes', icon: ShoesIcon },
  { key: 'outerwear', label: 'Outerwear', icon: OuterwearIcon },
  { key: 'dresses', label: 'Dresses', icon: DressIcon },
  { key: 'accessories', label: 'Accessories', icon: AccessoryIcon },
] as const

const FIELD =
  'mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy'

type UploadJob = {
  key: string
  name: string
  file: File
  status: 'queued' | 'uploading' | 'done' | 'error'
  progress: number
  elapsedMs: number
  item?: WardrobeItem
  error?: string
}

export function Closet() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [invalidNames, setInvalidNames] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'category'>('newest')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<WardrobeItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Closet — USTyle'
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

  const filterCounts = useMemo(
    () =>
      FILTERS.reduce(
        (acc, value) => {
          acc[value] = value === 'all' ? items.length : items.filter((item) => item.category === value).length
          return acc
        },
        {} as Record<(typeof FILTERS)[number], number>,
      ),
    [items],
  )

  const visible = useMemo(() => {
    const narrowed = filter === 'all' ? items : items.filter((item) => item.category === filter)
    const search = query.trim().toLowerCase()
    const searched = !search
      ? narrowed
      : narrowed.filter((item) => {
          const haystack = [
            itemTitle(item),
            item.color,
            item.cut,
            humanize(item.style),
            humanize(item.category),
            item.description,
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(search)
        })

    const sorted = [...searched]
    if (sortBy === 'category') {
      sorted.sort((a, b) => {
        const categoryDiff = humanize(a.category).localeCompare(humanize(b.category))
        if (categoryDiff !== 0) return categoryDiff
        return itemTitle(a).localeCompare(itemTitle(b))
      })
      return sorted
    }

    sorted.sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime()
      const bTime = new Date(b.createdAt || 0).getTime()
      return bTime - aTime
    })
    return sorted
  }, [filter, items, query, sortBy])

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  )

  const empty = !loading && items.length === 0
  const uploadingCount = jobs.filter((job) => job.status === 'uploading' || job.status === 'queued').length
  const activeIndex = jobs.findIndex((job) => job.status === 'uploading')
  const uploadStep =
    activeIndex >= 0
      ? activeIndex + 1
      : jobs.length - jobs.filter((job) => job.status === 'queued').length

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function uploadSingle(job: UploadJob) {
    const startedAt = Date.now()
    setJobs((prev) =>
      prev.map((entry) =>
        entry.key === job.key
          ? { ...entry, status: 'uploading', progress: 10, elapsedMs: 0, error: undefined, item: undefined }
          : entry,
      ),
    )

    const ticker = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      setJobs((prev) =>
        prev.map((entry) => {
          if (entry.key !== job.key || entry.status !== 'uploading') return entry
          return {
            ...entry,
            elapsedMs: elapsed,
            progress: Math.min(92, Math.max(entry.progress, 10 + elapsed / 85)),
          }
        }),
      )
    }, 200)

    try {
      const item = await uploadWardrobeItem(job.file)
      const elapsed = Date.now() - startedAt
      setItems((prev) => [item, ...prev.filter((existing) => existing.id !== item.id)])
      setJobs((prev) =>
        prev.map((entry) =>
          entry.key === job.key
            ? { ...entry, status: 'done', progress: 100, elapsedMs: elapsed, item, error: undefined }
            : entry,
        ),
      )
    } catch (err) {
      const elapsed = Date.now() - startedAt
      const message = friendlyError(err)
      setJobs((prev) =>
        prev.map((entry) =>
          entry.key === job.key
            ? { ...entry, status: 'error', progress: 100, elapsedMs: elapsed, error: message }
            : entry,
        ),
      )
    } finally {
      window.clearInterval(ticker)
    }
  }

  async function onFiles(files: File[]) {
    setError(null)
    setUploading(true)
    const queued: UploadJob[] = files.map((file, index) => ({
      key: `${file.name}-${file.size}-${index}-${Date.now()}`,
      name: file.name,
      file,
      status: 'queued',
      progress: 0,
      elapsedMs: 0,
    }))
    setJobs(queued)

    for (let i = 0; i < files.length; i += 1) {
      await uploadSingle(queued[i])
    }

    setUploading(false)
  }

  async function retryUpload(key: string) {
    const target = jobs.find((job) => job.key === key)
    if (!target) return
    setUploading(true)
    await uploadSingle(target)
    setUploading(false)
  }

  function dismissJob(key: string) {
    setJobs((prev) => prev.filter((job) => job.key !== key))
  }

  function onDeleted(id: string) {
    setItems((prev) => prev.filter((entry) => entry.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setError(null)
    const title = itemTitle(pendingDelete)
    try {
      await deleteWardrobeItem(pendingDelete.id)
      onDeleted(pendingDelete.id)
      setPendingDelete(null)
      setToast(`${title} deleted`)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[38px] leading-none font-semibold tracking-tight text-ink">Closet</h2>
          <p className="mt-5 text-[34px] leading-none font-semibold tracking-tight text-navy max-sm:text-[28px]">
            {items.length === 0 ? 'A home for your everyday clothes' : 'Your clothes, all in one place'}
          </p>
          <p className="mt-2 text-sm text-muted">
            {items.length === 0
              ? "Add what you own. We'll help with the combinations."
              : `${items.length} piece${items.length === 1 ? '' : 's'} · Only clothes you already own.`}
          </p>
        </div>

        <div className="text-right">
          <ButtonLink
            to="/studio"
            disabled={items.length === 0}
            className={
              items.length === 0
                ? 'rounded-xl border-0 bg-[#e9eef6] px-4 py-2 text-[#99a4b4] shadow-none hover:bg-[#e9eef6]'
                : 'rounded-xl px-4 py-2'
            }
          >
            + Create outfit
          </ButtonLink>
          {items.length === 0 ? <p className="mt-1 text-[11px] text-muted">Add clothes first</p> : null}
        </div>
      </div>

      {!loading ? (
        <div className="mt-6">
          <Dropzone
            id="wardrobe-upload"
            variant={items.length === 0 ? 'hero' : 'bar'}
            label={items.length === 0 ? 'Your closet is empty.' : 'Drop photos here or click to upload'}
            hint={items.length === 0 ? 'One item per photo — no models or outfits.' : 'One item per photo · JPEG, PNG or WebP'}
            cta="+ Upload clothes"
            multiple
            disabled={uploading}
            onFiles={(files) => void onFiles(files)}
            onInvalid={(names) => setInvalidNames(names)}
          />
          {items.length === 0 ? (
            <p className="mt-3 text-center text-xs text-muted">
              Drop one or many photos here • JPEG, PNG or WebP
            </p>
          ) : null}
        </div>
      ) : null}

      {jobs.length > 0 || invalidNames.length > 0 ? (
        <section className="mt-3 space-y-2">
          {jobs.length > 0 ? (
            <div className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-ink">
                {uploadingCount > 0 ? <Spinner label="" /> : <SuccessIcon />}
                <span className="font-semibold">
                  {uploadingCount > 0 ? `Uploading ${uploadStep} of ${jobs.length}...` : `Uploaded ${jobs.length} file${jobs.length === 1 ? '' : 's'}.`}
                </span>
                <span className="text-muted">JPEG, PNG or WebP</span>
              </div>
            </div>
          ) : null}

          {invalidNames.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-danger">
              <p>
                {invalidNames.length} file{invalidNames.length === 1 ? '' : 's'} skipped: {invalidNames.join(', ')}.
                Use JPEG, PNG or WebP.
              </p>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-semibold text-danger hover:bg-red-100"
                onClick={() => setInvalidNames([])}
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {jobs.length > 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  Upload batch · {jobs.length} photo{jobs.length === 1 ? '' : 's'}
                </p>
                <button
                  type="button"
                  className="text-xs font-semibold text-muted hover:text-ink"
                  onClick={() => setJobs([])}
                >
                  Clear batch
                </button>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {jobs.map((job) => (
                  <article key={job.key} className="rounded-xl border border-line bg-canvas px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{job.name}</p>
                        {job.status === 'uploading' ? (
                          <p className="text-xs text-muted">
                            AI is reading this garment... {(job.elapsedMs / 1000).toFixed(1)}s elapsed
                          </p>
                        ) : null}
                        {job.status === 'queued' ? <p className="text-xs text-muted">Queued</p> : null}
                        {job.status === 'done' ? (
                          <p className="text-xs text-success">
                            Saved · {humanize(job.item?.category || '') || 'Item'}
                            {job.item?.color ? ` · ${humanize(job.item.color)}` : ''}
                            {job.item ? ` · Formality ${job.item.formalityScore}/100` : ''}
                          </p>
                        ) : null}
                        {job.status === 'error' ? (
                          <p className="text-xs text-danger">
                            {job.error || 'We could not read this image. Try a clearer photo.'}
                          </p>
                        ) : null}
                      </div>

                      {job.status === 'done' ? (
                        <button
                          type="button"
                          className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink"
                          aria-label={`Dismiss ${job.name}`}
                          onClick={() => dismissJob(job.key)}
                        >
                          <CloseIcon />
                        </button>
                      ) : null}
                    </div>

                    {job.status === 'uploading' ? (
                      <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-line">
                          <div className="h-full rounded-full bg-navy transition-all" style={{ width: `${job.progress}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted">Uploading · {Math.round(job.progress)}%</p>
                      </div>
                    ) : null}

                    {job.status === 'error' ? (
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-navy hover:underline"
                        onClick={() => void retryUpload(job.key)}
                      >
                        Retry
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>

              <p className="mt-3 text-xs text-muted">Queued files upload in order. Finished files can be dismissed.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {loading ? (
        <div className="mt-10">
          <Spinner label="Loading closet…" />
        </div>
      ) : null}

      {empty ? (
        <section className="mt-5 rounded-2xl border border-line bg-surface px-5 py-5 shadow-sm">
          <h3 className="text-2xl font-semibold tracking-tight text-ink">What can I upload?</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {UPLOAD_TYPES.map((entry) => (
              <article key={entry.key} className="rounded-xl bg-canvas px-3.5 py-3">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <entry.icon />
                  {entry.label}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Upload one garment per photo (a pair of shoes counts as one). Lay it flat in even light with the whole piece
            visible. Photos of people, outfits, or multiple items will be rejected.
          </p>
        </section>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                    filter === value
                      ? 'bg-navy text-white'
                      : 'bg-surface text-muted ring-1 ring-line hover:text-ink'
                  }`}
                >
                  {FILTER_LABELS[value]} · {filterCounts[value]}
                </button>
              ))}
            </div>
            <span className="rounded-full bg-[#eef2f8] px-2.5 py-1 text-xs font-medium text-[#365178]">
              One personal closet
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[240px] flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-navy"
                placeholder="Search name, colour or style"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-canvas"
              onClick={() => setSortBy((prev) => (prev === 'newest' ? 'category' : 'newest'))}
            >
              <SortIcon />
              Sort: {sortBy === 'newest' ? 'Newest' : 'Category'}
            </button>
            <p className="ml-auto text-xs text-muted">
              Newest / Category · Showing {visible.length} of {items.length}
            </p>
          </div>

          {visible.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visible.map((item) => (
                <WardrobeCard
                  key={item.id}
                  item={item}
                  onOpen={() => setSelectedId(item.id)}
                  onRequestDelete={() => setPendingDelete(item)}
                />
              ))}
            </div>
          ) : (
            <p className="mt-8 text-sm text-muted">No items match your current filter.</p>
          )}
        </>
      ) : null}

      {selected ? (
        <ItemDrawer
          item={selected}
          onClose={() => setSelectedId(null)}
          onSaved={(next) => {
            setItems((prev) => prev.map((entry) => (entry.id === next.id ? next : entry)))
            setError(null)
          }}
          onRequestDelete={() => {
            setSelectedId(null)
            setPendingDelete(selected)
          }}
          onError={setError}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDeleteDialog
          item={pendingDelete}
          busy={deleting}
          onCancel={() => {
            if (!deleting) setPendingDelete(null)
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-navy px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

function WardrobeCard({
  item,
  onOpen,
  onRequestDelete,
}: {
  item: WardrobeItem
  onOpen: () => void
  onRequestDelete: () => void
}) {
  const title = itemTitle(item)
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex min-h-[205px] gap-3 p-3">
        <div className="flex w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eef1f6]">
          {item.imageUrl ? (
            <img
              src={apiUrl(item.imageUrl)}
              alt={item.description || title}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm font-medium text-muted">{humanize(item.category)}</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-[19px] font-semibold tracking-tight text-ink">{title}</h3>
            <span className="rounded-full bg-[#edf2f8] px-2 py-0.5 text-[11px] font-semibold text-[#324d74]">
              {humanize(item.category)}
            </span>
          </div>

          <p className="mt-2 text-sm text-muted">
            <span className="text-ink">●</span> {displayAttr(item.color)} · {displayAttr(item.cut)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {humanize(item.style)} · {humanize(item.itemGender) || 'Unisex'}
          </p>
          <p className="mt-1 text-xs font-medium text-navy">Formality {item.formalityScore}/100</p>
          <p className="mt-2 line-clamp-2 text-sm text-muted">{item.description || 'No description yet.'}</p>

          <div className="mt-auto pt-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <button
                type="button"
                className="font-semibold text-navy hover:underline"
                onClick={onOpen}
              >
                Edit
              </button>
              <button
                type="button"
                className="font-semibold text-danger hover:underline"
                onClick={onRequestDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function ItemDrawer({
  item,
  onClose,
  onSaved,
  onRequestDelete,
  onError,
}: {
  item: WardrobeItem
  onClose: () => void
  onSaved: (item: WardrobeItem) => void
  onRequestDelete: () => void
  onError: (message: string) => void
}) {
  const navigate = useNavigate()
  const [category, setCategory] = useState(item.category)
  const [color, setColor] = useState(item.color)
  const [cut, setCut] = useState(item.cut)
  const [style, setStyle] = useState(item.style)
  const [formalityScore, setFormalityScore] = useState(String(item.formalityScore))
  const [itemGender, setItemGender] = useState(item.itemGender || 'unisex')
  const [description, setDescription] = useState(item.description)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setCategory(item.category)
    setColor(item.color)
    setCut(item.cut)
    setStyle(item.style)
    setFormalityScore(String(item.formalityScore))
    setItemGender(item.itemGender || 'unisex')
    setDescription(item.description)
    setFormError(null)
  }, [item])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const title = itemTitle({ ...item, color, category, description })
  const categoryOptions = CATEGORY_OPTIONS.some((option) => option.value === category)
    ? CATEGORY_OPTIONS
    : [{ value: category, label: humanize(category) }, ...CATEGORY_OPTIONS]
  const styleOptions = STYLE_OPTIONS.some((option) => option.value === style)
    ? STYLE_OPTIONS
    : style
      ? [{ value: style, label: humanize(style) }, ...STYLE_OPTIONS]
      : STYLE_OPTIONS

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      const next = await updateWardrobeItem(item.id, {
        category,
        color: color.trim(),
        cut: cut.trim(),
        style,
        formalityScore: Number(formalityScore),
        description: description.trim(),
        itemGender,
      })
      onSaved(next)
    } catch (err) {
      const message = friendlyError(err)
      setFormError(message)
      onError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-ink/35"
        aria-label="Close item details"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-drawer-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-[430px] flex-col overflow-y-auto bg-surface shadow-2xl max-lg:max-w-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div>
            <h2 id="item-drawer-title" className="text-[35px] leading-none font-semibold tracking-tight text-ink">
              {title}
            </h2>
            <p className="mt-2 text-sm text-muted">
              Tagged by AI — <span className="text-ink">fix anything that looks wrong</span>
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-canvas hover:text-ink"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon />
            Close
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="overflow-hidden rounded-xl bg-[#eef1f6]">
            {item.imageUrl ? (
              <img
                src={apiUrl(item.imageUrl)}
                alt={item.description || title}
                className="aspect-[4/3] w-full object-contain"
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted">
                {humanize(item.category)}
              </div>
            )}
          </div>
        </div>

        <form className="flex flex-1 flex-col px-6 pb-6 pt-4" onSubmit={(event) => void onSubmit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-muted">Category</span>
              <select
                className={FIELD}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">Colour</span>
              <input
                className={FIELD}
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">Cut</span>
              <input
                className={FIELD}
                list="wardrobe-cut-suggestions"
                value={cut}
                onChange={(event) => setCut(event.target.value)}
              />
              <datalist id="wardrobe-cut-suggestions">
                {CUT_SUGGESTIONS.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">Style</span>
              <select className={FIELD} value={style} onChange={(event) => setStyle(event.target.value)}>
                {styleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-muted">Formality (0–100)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                required
                className={FIELD}
                value={formalityScore}
                onChange={(event) => setFormalityScore(event.target.value)}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-muted">Gender</span>
              <select
                className={FIELD}
                value={itemGender}
                onChange={(event) => setItemGender(event.target.value)}
              >
                {ITEM_GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-muted">Description</span>
              <textarea
                className={`${FIELD} min-h-[88px] resize-y`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>

          {formError ? (
            <div className="mt-4">
              <ErrorNote message={formError} />
            </div>
          ) : null}

          <Button type="submit" disabled={saving} className="mt-5 w-full justify-center py-2.5">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={saving}
              className="inline-flex items-center gap-1 text-sm font-semibold text-danger hover:underline disabled:opacity-50"
              onClick={onRequestDelete}
            >
              <TrashIcon />
              Delete item
            </button>
            <button
              type="button"
              className="text-sm font-semibold text-navy hover:underline"
              onClick={() => navigate('/studio')}
            >
              Build an outfit around this
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}

function ConfirmDeleteDialog({
  item,
  busy,
  onCancel,
  onConfirm,
}: {
  item: WardrobeItem
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const title = itemTitle(item)

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!busy) onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onCancel])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/45"
        aria-label="Cancel delete"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-body"
        className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-danger">
          <TrashIcon />
        </span>
        <h2 id="delete-dialog-title" className="mt-4 text-[34px] leading-none font-semibold tracking-tight text-ink">
          Delete this item?
        </h2>
        <p id="delete-dialog-body" className="mt-3 text-sm leading-relaxed text-muted">
          '{title}' will be removed from your closet and won't be used for new outfits.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function displayAttr(value: string | null | undefined): string {
  if (!value) return '—'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function SearchIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
      <circle cx="8.7" cy="8.7" r="4.7" stroke="currentColor" strokeWidth="1.5" />
      <path d="m12.3 12.3 3.6 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SortIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M5 5h10M5 10h7M5 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function SuccessIcon() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-success">
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
        <path d="m4 8 2.2 2.2L12 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M6.6 7.2V14a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1V7.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.3 5.8h9.4M8 5.8v-1a.8.8 0 0 1 .8-.8h2.4a.8.8 0 0 1 .8.8v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function TopIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-navy" fill="none" aria-hidden>
      <path d="M6.4 5.3 10 8l3.6-2.7 2.2 1.5v7.7H4.2V6.8l2.2-1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 8v6.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function BottomIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-navy" fill="none" aria-hidden>
      <path d="M6.2 4.8h7.6l-.5 10.4H6.7L6.2 4.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8.6 4.8v2M11.4 4.8v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ShoesIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-navy" fill="none" aria-hidden>
      <path d="M3.8 12.6h12.4a2 2 0 0 1-2 2H5.8a2 2 0 0 1-2-2Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 10.2h2.3l1.2 1.2h3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function OuterwearIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-navy" fill="none" aria-hidden>
      <path d="M7.2 4.8 10 7.2l2.8-2.4 2.2 1.6v8.8H5V6.4l2.2-1.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 7.2v8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function DressIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-navy" fill="none" aria-hidden>
      <path d="M8.2 4.5h3.6l.5 2.2-2.3 1.8-2.3-1.8.5-2.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="m10 8.5-4.3 6.7h8.6L10 8.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function AccessoryIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-navy" fill="none" aria-hidden>
      <rect x="5.3" y="5.1" width="9.4" height="9.4" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 9.3h4M8 11.5h2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
