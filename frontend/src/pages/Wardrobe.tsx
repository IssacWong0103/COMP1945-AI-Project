import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  apiUrl,
  deleteWardrobeItem,
  friendlyError,
  listWardrobeItems,
  updateWardrobeItem,
  uploadWardrobeItem,
} from '../api/client'
import { Button } from '../components/Button'
import { Dropzone } from '../components/Dropzone'
import { ErrorNote } from '../components/ErrorNote'
import { Spinner } from '../components/Spinner'
import {
  CATEGORY_OPTIONS,
  CUT_SUGGESTIONS,
  ITEM_GENDER_OPTIONS,
  STYLE_OPTIONS,
  colorSwatch,
  humanize,
  itemTitle,
} from '../constants'
import type { WardrobeItem } from '../types'

const FILTERS = ['all', 'top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory'] as const

const TAG_GUIDE = [
  {
    title: 'Category',
    body: 'Top, Bottom, Outerwear, Dress, Shoes, Accessory',
  },
  {
    title: 'Colour',
    body: 'Navy, olive, white, light blue…',
  },
  {
    title: 'Cut',
    body: 'Slim tapered, boxy, relaxed fit…',
  },
  {
    title: 'Style',
    body: 'Casual, smart casual, streetwear…',
  },
  {
    title: 'Formality',
    body: 'An editable 0–100 score used for occasion matching',
  },
  {
    title: 'Description',
    body: 'One short line from the vision model',
  },
] as const

const FIELD =
  'mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy'

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<WardrobeItem | null>(null)
  const [deleting, setDeleting] = useState(false)

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
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  )
  const empty = !loading && items.length === 0

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

  function onDeleted(id: string) {
    setItems((prev) => prev.filter((entry) => entry.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setError(null)
    try {
      await deleteWardrobeItem(pendingDelete.id)
      onDeleted(pendingDelete.id)
      setPendingDelete(null)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h2 className="text-[26px] font-semibold tracking-tight text-ink">Wardrobe</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {items.length > 0
            ? `${items.length} piece${items.length === 1 ? '' : 's'} · Clothes you already own.`
            : 'Clothes you already own. USTyle only builds outfits from this closet.'}
        </p>
      </div>

      {!loading ? (
        <div className="mt-6">
          {items.length === 0 ? (
            <Dropzone
              id="wardrobe-upload"
              variant="hero"
              label="Drag and drop photos here, or click to upload"
              hint="JPEG, PNG or WebP · one or many photos at a time"
              cta="Choose photos"
              multiple
              disabled={uploading}
              onFiles={(files) => void onFiles(files)}
              onInvalid={(names) => setError(`Only JPEG, PNG, or WebP. Skipped: ${names.join(', ')}`)}
            />
          ) : (
            <Dropzone
              id="wardrobe-upload"
              variant="bar"
              label="Drop photos here or click to upload"
              hint="JPEG, PNG or WebP"
              multiple
              disabled={uploading}
              onFiles={(files) => void onFiles(files)}
              onInvalid={(names) => setError(`Only JPEG, PNG, or WebP. Skipped: ${names.join(', ')}`)}
            />
          )}
        </div>
      ) : null}

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

      {loading ? (
        <div className="mt-10">
          <Spinner label="Loading wardrobe…" />
        </div>
      ) : null}

      {empty ? (
        <>
          <section className="mt-5 rounded-2xl border border-line bg-surface px-5 py-5 shadow-sm">
            <h3 className="text-[15px] font-semibold text-ink">No items yet</h3>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">
              Upload tops, bottoms and shoes you already own. Add outerwear, dresses and accessories too
              — one piece per photo, laid flat or on a hanger, in even light.
            </p>
          </section>

          <section className="mt-5 rounded-2xl border border-line bg-surface px-5 py-5 shadow-sm">
            <h3 className="text-[15px] font-semibold text-ink">What USTyle reads from each photo</h3>
            <p className="mt-1.5 text-sm text-muted">
              After upload, AI tags every item so matching knows what you own. You will see these tags on
              each card.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {TAG_GUIDE.map((tag) => (
                <article key={tag.title} className="rounded-xl bg-canvas px-3.5 py-3">
                  <p className="text-sm font-semibold text-ink">{tag.title}</p>
                  <p className="mt-1 text-[13px] leading-snug text-muted">{tag.body}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
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
                  {value === 'all' ? 'All' : humanize(value)}
                </button>
              ))}
            </div>
            <p className="text-sm font-medium text-muted">
              Showing {visible.length} {visible.length === 1 ? 'item' : 'items'}
            </p>
          </div>

          {visible.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <p className="mt-8 text-sm text-muted">No items in this category.</p>
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
          onRequestDelete={() => setPendingDelete(selected)}
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

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-sm outline-none transition hover:border-navy/30 hover:shadow-md"
    >
      <div className="flex aspect-[5/4] items-center justify-center overflow-hidden bg-[#eef1f6]">
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
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold leading-snug text-ink">{title}</h3>
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-navy">
            <span className="h-1.5 w-1.5 rounded-full bg-navy" />
            {humanize(item.category)}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-4 gap-2">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Colour</dt>
            <dd className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ background: colorSwatch(item.color) }}
                aria-hidden
              />
              {displayAttr(item.color)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Cut</dt>
            <dd className="mt-1 text-[13px] font-medium text-ink">{displayAttr(item.cut)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Style</dt>
            <dd className="mt-1 text-[13px] font-medium text-ink">{humanize(item.style) || '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Formality</dt>
            <dd className="mt-1 text-[13px] font-medium text-ink">{item.formalityScore}/100</dd>
          </div>
        </dl>

        {item.description ? (
          <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted">{item.description}</p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <p className="flex items-center gap-2 text-[12px] text-muted">
            Fits
            <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2 py-0.5 font-medium text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-navy" />
              {humanize(item.itemGender) || 'Unisex'}
            </span>
          </p>
          <button
            type="button"
            className="rounded-lg border border-red-300 px-3 py-1 text-[13px] font-semibold text-danger hover:bg-red-50"
            aria-label={`Delete ${title}`}
            onClick={(event) => {
              event.stopPropagation()
              onRequestDelete()
            }}
          >
            Delete
          </button>
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
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col overflow-y-auto bg-surface shadow-2xl max-lg:max-w-none"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <h2 id="item-drawer-title" className="text-lg font-semibold tracking-tight text-ink">
            {title}
          </h2>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon />
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
          <p className="mt-4 text-sm text-muted">
            Tagged by AI — <span className="text-ink">fix anything that looks wrong</span>
          </p>
        </div>

        <form className="flex flex-1 flex-col px-6 pb-8 pt-4" onSubmit={(event) => void onSubmit(event)}>
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
              <span className="text-xs font-medium text-muted">Gender · optional</span>
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

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <button
              type="button"
              disabled={saving}
              className="rounded-lg border border-red-300 px-3.5 py-2 text-sm font-semibold text-danger hover:bg-red-50 disabled:opacity-50"
              onClick={onRequestDelete}
            >
              Delete item
            </button>
          </div>

          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-canvas"
            onClick={() => navigate('/studio')}
          >
            Build an outfit around this
          </button>
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
        <h2 id="delete-dialog-title" className="text-lg font-semibold tracking-tight text-ink">
          Delete this item?
        </h2>
        <div className="mt-4 flex gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-canvas">
            {item.imageUrl ? (
              <img
                src={apiUrl(item.imageUrl)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] font-medium text-muted">
                {humanize(item.category)}
              </div>
            )}
          </div>
          <p id="delete-dialog-body" className="text-sm leading-relaxed text-muted">
            <span className="font-semibold text-ink">{title}</span> will be removed from your wardrobe.
            This cannot be undone.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? 'Deleting…' : 'Delete item'}
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
