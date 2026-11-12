import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { analyzePhoto, apiUrl, friendlyError, getProfile, updateProfile } from '../api/client'
import { Button, ButtonLink } from '../components/Button'
import { ErrorNote } from '../components/ErrorNote'
import { Spinner } from '../components/Spinner'
import { SuggestSelect } from '../components/SuggestSelect'
import {
  GENDER_OPTIONS,
  IMAGE_ACCEPT,
  STYLE_OPTIONS,
  isAllowedImage,
  skinToneHex,
} from '../constants'
import type { Profile as ProfileData } from '../types'

const EMPTY: ProfileData = {
  bodyPhotoUrl: null,
  heightCm: null,
  weightKg: null,
  gender: null,
  skinTone: null,
  preferredStyle: null,
}

const FIELD =
  'w-full appearance-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-navy [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

const BADGE =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold'

export function Profile() {
  const photoInputId = useId()
  const photoImgRef = useRef<HTMLImageElement | null>(null)
  const analysisRequestRef = useRef(0)
  const [pickingTone, setPickingTone] = useState(false)
  const [autoDetected, setAutoDetected] = useState(false)
  const [profile, setProfile] = useState<ProfileData>(EMPTY)
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [gender, setGender] = useState('')
  const [skinTone, setSkinTone] = useState('')
  const [preferredStyle, setPreferredStyle] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [formEpoch, setFormEpoch] = useState(0)

  useEffect(() => {
    document.title = 'Settings — USTyle'
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getProfile()
        if (cancelled) return
        applyProfile(data)
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

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function applyProfile(data: ProfileData) {
    setProfile(data)
    setHeightCm(data.heightCm != null ? String(data.heightCm) : '')
    setWeightKg(data.weightKg != null ? String(data.weightKg) : '')
    setGender(data.gender ?? '')
    setSkinTone(data.skinTone ?? '')
    setPreferredStyle(data.preferredStyle ?? '')
    setPhoto(null)
    setPickingTone(false)
    setAutoDetected(false)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setFormEpoch((epoch) => epoch + 1)
  }

  function takeFile(file: File) {
    if (!isAllowedImage(file)) {
      setError('Only JPEG, PNG, or WebP for the body photo.')
      return
    }
    setError(null)
    setPhoto(file)
    setSaved(false)
    setPickingTone(false)
    setAutoDetected(false)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })

    const requestId = analysisRequestRef.current + 1
    analysisRequestRef.current = requestId
    void analyzePhoto(file)
      .then((result) => {
        if (requestId !== analysisRequestRef.current) return
        if (result.gender) setGender(result.gender)
        if (result.skinTone) setSkinTone(result.skinTone)
        setAutoDetected(Boolean(result.gender || result.skinTone))
      })
      .catch(() => {
        // Auto-fill is best effort; the user can still choose attributes manually.
      })
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) takeFile(file)
  }

  function onPhotoClick(event: ReactMouseEvent<HTMLImageElement>) {
    const image = photoImgRef.current
    if (!image) return
    const color = sampleImagePixel(image, event.clientX, event.clientY)
    if (!color) return
    setSkinTone(color)
    setSaved(false)
    setPickingTone(false)
  }

  function discard() {
    applyProfile(profile)
    setError(null)
    setSaved(false)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      const data = await updateProfile({
        file: photo,
        heightCm: heightCm ? Number(heightCm) : null,
        weightKg: weightKg ? Number(weightKg) : null,
        gender: gender.trim() || null,
        skinTone: skinTone.trim() || null,
        preferredStyle: preferredStyle.trim() || null,
      })
      applyProfile(data)
      setSaved(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  const dirty = useMemo(() => {
    const savedHeight = profile.heightCm != null ? String(profile.heightCm) : ''
    const savedWeight = profile.weightKg != null ? String(profile.weightKg) : ''
    return (
      photo !== null ||
      heightCm !== savedHeight ||
      weightKg !== savedWeight ||
      gender !== (profile.gender ?? '') ||
      skinTone !== (profile.skinTone ?? '') ||
      preferredStyle !== (profile.preferredStyle ?? '')
    )
  }, [photo, heightCm, weightKg, gender, skinTone, preferredStyle, profile])

  const shownPhoto = preview || (profile.bodyPhotoUrl ? apiUrl(profile.bodyPhotoUrl) : null)
  const meta = photoMeta(photo, profile.bodyPhotoUrl)
  const filled = [heightCm, weightKg, gender, skinTone, preferredStyle].filter((value) => value.trim()).length

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[26px] font-semibold tracking-tight text-ink">Profile</h2>
        </div>
        <ButtonLink to="/studio" variant="secondary" className="rounded-xl px-4">
          <PlusIcon />
          Create outfit
        </ButtonLink>
      </div>
      <div className="mt-6">
        <h3 className="text-[34px] font-semibold tracking-tight text-navy">A little about you</h3>
        <p className="mt-1 text-sm text-muted">Make try-on more useful. Every attribute is optional.</p>
      </div>

      {loading ? (
        <div className="mt-10">
          <Spinner label="Loading profile…" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6">
          <div className="grid gap-4 lg:grid-cols-12">
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm lg:col-span-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[28px] font-semibold tracking-tight text-navy">Your full-body photo</h3>
                <span
                  className={`${BADGE} ${
                    shownPhoto ? 'border-emerald-200 bg-emerald-50 text-success' : 'border-line bg-canvas text-muted'
                  }`}
                >
                  {shownPhoto ? (
                    <>
                      <CheckMiniIcon />
                      Photo added
                    </>
                  ) : (
                    'Optional'
                  )}
                </span>
              </div>
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
                className="mt-4 overflow-hidden rounded-xl border-2 border-dashed border-line bg-canvas p-3"
              >
                {shownPhoto ? (
                  <img
                    ref={photoImgRef}
                    src={shownPhoto}
                    alt="Full-body photo for virtual try-on"
                    onClick={pickingTone ? onPhotoClick : undefined}
                    className={`aspect-[3/4] w-full rounded-lg ${
                      pickingTone ? 'cursor-crosshair object-contain' : 'object-cover'
                    }`}
                  />
                ) : (
                  <div className="flex aspect-[3/4] flex-col items-center justify-center px-6 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-navy shadow-sm">
                      <PersonIcon />
                    </span>
                    <p className="mt-3 text-[32px] font-semibold tracking-tight text-navy">No photo yet</p>
                    <label
                      htmlFor={photoInputId}
                      className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-deep ${
                        saving ? 'pointer-events-none opacity-60' : ''
                      }`}
                    >
                      <UploadIcon />
                      Upload photo
                    </label>
                    <p className="mt-2 text-xs text-muted">JPEG, PNG or WebP</p>
                    <p className="mt-3 max-w-[250px] text-xs text-muted">
                      One full-body photo is all you need - make sure your face is clearly visible. We check
                      automatically that it's a full-body shot, not a half-body one.
                    </p>
                  </div>
                )}
              </div>
              <input
                id={photoInputId}
                type="file"
                className="sr-only"
                accept={IMAGE_ACCEPT}
                disabled={saving}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) takeFile(file)
                  event.target.value = ''
                }}
              />

              {shownPhoto && meta ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{meta.name}</p>
                    <p className="text-xs text-muted">{meta.kind} · Full-body photo</p>
                  </div>
                  <label
                    htmlFor={photoInputId}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-navy transition hover:bg-canvas ${
                      saving ? 'pointer-events-none opacity-60' : ''
                    }`}
                  >
                    <ReplaceIcon />
                    Replace photo
                  </label>
                </div>
              ) : null}
              <div className="mt-3 rounded-xl bg-canvas px-3 py-2.5">
                <p className="flex items-start gap-2 text-xs text-muted">
                  <span className="mt-0.5 text-navy">
                    <ShieldIcon />
                  </span>
                  Your photo is only used for virtual try-on. It is not shared or shown as a public profile.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm lg:col-span-7">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[28px] font-semibold tracking-tight text-navy">Your attributes</h3>
                <span className={`${BADGE} border-transparent bg-canvas text-muted`}>All optional</span>
              </div>
              <p className="mt-2 text-sm text-muted">{filled} of 5 filled - height and style matter most</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: `${(filled / 5) * 100}%` }}
                />
              </div>
              <div className="mt-4 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Height · cm" htmlFor="heightCm" hint="Helps proportions in try-on.">
                  <div className="relative">
                    <input
                      id="heightCm"
                      name="heightCm"
                      type="number"
                      inputMode="numeric"
                      min={100}
                      max={250}
                      step={1}
                      value={heightCm}
                      onChange={(event) => {
                        setHeightCm(event.target.value)
                        setSaved(false)
                      }}
                      className={FIELD}
                      placeholder="-"
                    />
                  </div>
                </Field>

                <Field label="Weight · kg" htmlFor="weightKg" hint="Helps fit in try-on.">
                  <div className="relative">
                    <input
                      id="weightKg"
                      name="weightKg"
                      type="number"
                      inputMode="decimal"
                      min={30}
                      max={200}
                      step={0.1}
                      value={weightKg}
                      onChange={(event) => {
                        setWeightKg(event.target.value)
                        setSaved(false)
                      }}
                      className={FIELD}
                      placeholder="-"
                    />
                  </div>
                </Field>
                </div>
                <p className="mt-1 text-xs text-muted">Height 100-250 cm · Weight 30-200 kg</p>

                <Field label="Gender" htmlFor="gender" hint="Helps suggest suitable pieces.">
                  <div className="relative">
                    <select
                      id="gender"
                      name="gender"
                      value={gender}
                      onChange={(event) => {
                        setGender(event.target.value)
                        setSaved(false)
                      }}
                      className={`${FIELD} pr-10`}
                    >
                      <option value="">Select gender</option>
                      {GENDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </Field>

                <Field
                  label="Skin tone"
                  htmlFor="skinTone"
                  hint="Pick the color closest to your skin, or sample it straight from your photo."
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                      <input
                        id="skinTone"
                        name="skinTone"
                        type="color"
                        value={skinToneHex(skinTone)}
                        onChange={(event) => {
                          setSkinTone(event.target.value)
                          setSaved(false)
                        }}
                        disabled={saving}
                        className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <span className="text-sm font-medium tabular-nums text-ink">
                        {skinTone || 'Select color'}
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-xl"
                      disabled={saving || !shownPhoto}
                      onClick={() => {
                        setPickingTone((active) => !active)
                        setSaved(false)
                      }}
                    >
                      <DropperIcon />
                      {pickingTone ? 'Click your skin in the photo' : 'Pick from photo'}
                    </Button>
                    {skinTone ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setSkinTone('')
                          setSaved(false)
                        }}
                        className="text-xs font-semibold text-muted underline hover:text-ink disabled:opacity-50"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  {pickingTone ? (
                    <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
                      Click directly on your skin in the photo above to set the color.
                    </p>
                  ) : null}
                  {autoDetected ? (
                    <p className="mt-2 text-xs text-success">
                      We pre-filled gender and skin tone from your photo — adjust if needed.
                    </p>
                  ) : null}
                </Field>

                <Field label="Preferred style" htmlFor="preferredStyle" hint="Your default on Studio.">
                  <SuggestSelect
                    key={`style-${formEpoch}`}
                    id="preferredStyle"
                    name="preferredStyle"
                    value={preferredStyle}
                    options={STYLE_OPTIONS}
                    placeholder="Select style"
                    customPlaceholder="e.g. dark academia, preppy, Y2K"
                    onChange={(next) => {
                      setPreferredStyle(next)
                      setSaved(false)
                    }}
                    disabled={saving}
                  />
                </Field>
              </div>
              <p className="mt-4 text-xs text-muted">
                Gender: Male / Female / Non-binary / Prefer not to say Skin tone: a color you pick from the photo or
                color picker Style: Casual / Smart casual / Streetwear / Sporty / Minimal / Formal
              </p>
            </section>
          </div>

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error} />
            </div>
          ) : null}

          {dirty ? (
            <div className="sticky bottom-4 z-10 mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-surface px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <WarningDotIcon />
                You have unsaved changes
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" className="rounded-xl" onClick={discard} disabled={saving}>
                  Discard
                </Button>
                <Button type="submit" className="rounded-xl" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>
          ) : saved ? (
            <p className="mt-4 text-sm font-medium text-success" role="status">
              Profile saved.
            </p>
          ) : null}
        </form>
      )}
    </div>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      <p className="mt-1.5 text-xs text-muted">{hint}</p>
    </div>
  )
}

function SelectChevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      fill="none"
      aria-hidden
    >
      <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden>
      <circle cx="10" cy="7" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 16c.7-2.4 2.5-3.6 5-3.6s4.3 1.2 5 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M10 13.4V5.2M10 5.2 7.4 7.8M10 5.2l2.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.8 13.2v1.8A1.2 1.2 0 0 0 6 16.2h8a1.2 1.2 0 0 0 1.2-1.2v-1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ReplaceIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M5.4 8.2a4.8 4.8 0 0 1 8.2-1.8l1.4 1.4M14.6 11.8a4.8 4.8 0 0 1-8.2 1.8L5 12.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 5.6v2.6h-2.6M5 14.4v-2.6h2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DropperIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="M13.2 3.6a2 2 0 0 1 2.8 2.8l-6.4 6.4-3.4.6.6-3.4 6.4-6.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M4.5 15.5c-.8.8-.8 2 0 2.8s2 .8 2.8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M10 3.6 15.2 5.8v4.4c0 3.2-2.2 5.3-5.2 6.2-3-1-5.2-3-5.2-6.2V5.8L10 3.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7.8 10.1 9.4 11.6l2.9-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckMiniIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M4.2 8.2 6.8 10.6 11.8 5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WarningDotIcon() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-300 text-[10px] text-amber-600">
      •
    </span>
  )
}

function sampleImagePixel(
  image: HTMLImageElement,
  clientX: number,
  clientY: number,
): string | null {
  const rect = image.getBoundingClientRect()
  const naturalWidth = image.naturalWidth
  const naturalHeight = image.naturalHeight
  if (!naturalWidth || !naturalHeight || rect.width === 0 || rect.height === 0) return null

  const pointX = clientX - rect.left
  const pointY = clientY - rect.top
  if (pointX < 0 || pointY < 0 || pointX > rect.width || pointY > rect.height) return null

  const objectFit = getComputedStyle(image).objectFit
  const scale =
    objectFit === 'cover'
      ? Math.max(rect.width / naturalWidth, rect.height / naturalHeight)
      : Math.min(rect.width / naturalWidth, rect.height / naturalHeight)
  const drawnWidth = naturalWidth * scale
  const drawnHeight = naturalHeight * scale
  const offsetX = (rect.width - drawnWidth) / 2
  const offsetY = (rect.height - drawnHeight) / 2
  const sourceX = Math.floor((pointX - offsetX) / scale)
  const sourceY = Math.floor((pointY - offsetY) / scale)
  if (sourceX < 0 || sourceY < 0 || sourceX >= naturalWidth || sourceY >= naturalHeight) {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = naturalWidth
  canvas.height = naturalHeight
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(image, 0, 0)
  const [red, green, blue] = context.getImageData(sourceX, sourceY, 1, 1).data
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function photoMeta(file: File | null, url: string | null): { name: string; kind: string } | null {
  if (file) {
    const kind = file.type === 'image/png' ? 'PNG' : file.type === 'image/webp' ? 'WebP' : 'JPEG'
    return { name: file.name, kind }
  }
  if (!url) return null
  const last = url.split('/').pop() || 'body-photo'
  const name = decodeURIComponent(last.split('?')[0] || 'body-photo')
  const ext = name.split('.').pop()?.toLowerCase()
  const kind = ext === 'png' ? 'PNG' : ext === 'webp' ? 'WebP' : 'JPEG'
  return { name, kind }
}
