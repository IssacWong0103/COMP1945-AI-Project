import { useEffect, useId, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { apiUrl, friendlyError, getProfile, updateProfile } from '../api/client'
import { Button, ButtonLink } from '../components/Button'
import { ErrorNote } from '../components/ErrorNote'
import { Spinner } from '../components/Spinner'
import { SuggestSelect } from '../components/SuggestSelect'
import { GENDER_OPTIONS, IMAGE_ACCEPT, SKIN_TONE_OPTIONS, STYLE_OPTIONS, isAllowedImage } from '../constants'
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

export function Profile() {
  const photoInputId = useId()
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
    document.title = 'Me — USTyle'
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
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) takeFile(file)
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
          <h2 className="text-[26px] font-semibold tracking-tight text-ink">Me</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Your photo and preferences. Only used to help style your own clothes.
          </p>
        </div>
        <ButtonLink to="/dress-me" className="rounded-xl px-4">
          Create outfit
        </ButtonLink>
      </div>

      {loading ? (
        <div className="mt-10">
          <Spinner label="Loading profile…" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6">
          <div className="grid gap-4 lg:grid-cols-12">
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm lg:col-span-5">
              <h3 className="text-[15px] font-semibold text-ink">Your full-body photo</h3>
              <label
                htmlFor={photoInputId}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
                className="mt-4 block cursor-pointer overflow-hidden rounded-xl bg-canvas"
              >
                {shownPhoto ? (
                  <img
                    src={shownPhoto}
                    alt="Full-body photo for virtual try-on"
                    className="aspect-[3/4] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 px-6 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-navy shadow-sm">
                      <PersonIcon />
                    </span>
                    <p className="text-sm font-semibold text-ink">Add a full-body photo</p>
                    <p className="text-xs text-muted">Stand straight, even lighting, full figure in frame.</p>
                  </div>
                )}
              </label>
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

              {meta ? (
                <p className="mt-3 text-xs text-muted">
                  {meta.name} · {meta.kind}
                </p>
              ) : null}

              <div className="mt-3">
                <label
                  htmlFor={photoInputId}
                  className="inline-flex cursor-pointer rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-canvas"
                >
                  {shownPhoto ? 'Replace photo' : 'Upload photo'}
                </label>
              </div>
              <p className="mt-2 text-xs text-muted">JPEG, PNG or WebP</p>
              <hr className="my-4 border-line" />
              <p className="text-xs leading-relaxed text-muted">
                Your photo is only used for virtual try-on. It is not shared or shown as a public profile.
              </p>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm lg:col-span-7">
              <h3 className="text-[15px] font-semibold text-ink">A little about you</h3>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  {filled} of 5 filled — height and style matter most
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: `${(filled / 5) * 100}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-muted">All optional. You can create outfits without these.</p>

              <div className="mt-5 grid gap-4">
                <Field label="Height" htmlFor="heightCm" hint="Helps proportions in try-on. Range: 100–250 cm.">
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
                      className={`${FIELD} pr-12`}
                      placeholder="178"
                    />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
                      cm
                    </span>
                  </div>
                </Field>

                <Field label="Weight" htmlFor="weightKg" hint="Helps fit in try-on. Range: 30–200 kg.">
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
                      className={`${FIELD} pr-12`}
                      placeholder="68"
                    />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
                      kg
                    </span>
                  </div>
                </Field>

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
                      <option value="">Select</option>
                      {GENDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </Field>

                <Field label="Skin tone" htmlFor="skinTone" hint="Helps suggest flattering colours.">
                  <SuggestSelect
                    key={`skin-${formEpoch}`}
                    id="skinTone"
                    name="skinTone"
                    value={skinTone}
                    options={SKIN_TONE_OPTIONS}
                    placeholder="Select"
                    customPlaceholder="e.g. olive with warm undertone"
                    customHint="Presets are a starting point. Your own words go to try-on as a colour hint."
                    onChange={(next) => {
                      setSkinTone(next)
                      setSaved(false)
                    }}
                    disabled={saving}
                  />
                </Field>

                <Field label="Preferred style" htmlFor="preferredStyle" hint="Your default on Studio.">
                  <SuggestSelect
                    key={`style-${formEpoch}`}
                    id="preferredStyle"
                    name="preferredStyle"
                    value={preferredStyle}
                    options={STYLE_OPTIONS}
                    placeholder="Select"
                    customPlaceholder="e.g. dark academia, preppy, Y2K"
                    customHint="Presets help match tagged clothes. Custom words are a soft hint, not a hard filter."
                    onChange={(next) => {
                      setPreferredStyle(next)
                      setSaved(false)
                    }}
                    disabled={saving}
                  />
                </Field>
              </div>
            </section>
          </div>

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error} />
            </div>
          ) : null}

          {dirty ? (
            <div className="sticky bottom-4 z-10 mt-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink">You have unsaved changes</p>
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
