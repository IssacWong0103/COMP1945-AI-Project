import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { apiUrl, friendlyError, getProfile, updateProfile } from '../api/client'
import { Button } from '../components/Button'
import { Dropzone } from '../components/Dropzone'
import { ErrorNote } from '../components/ErrorNote'
import { PageHeader } from '../components/PageHeader'
import { Spinner } from '../components/Spinner'
import { GENDER_OPTIONS, SKIN_TONE_OPTIONS, STYLE_OPTIONS } from '../constants'
import type { Profile as ProfileData } from '../types'

const EMPTY: ProfileData = {
  bodyPhotoUrl: null,
  heightCm: null,
  weightKg: null,
  gender: null,
  skinTone: null,
  preferredStyle: null,
}

export function Profile() {
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

  useEffect(() => {
    document.title = 'Profile — USTyle'
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
  }

  function onPhoto(files: File[]) {
    const file = files[0]
    if (!file) return
    setPhoto(file)
    setSaved(false)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
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
        gender: gender || null,
        skinTone: skinTone || null,
        preferredStyle: preferredStyle || null,
      })
      applyProfile(data)
      setPhoto(null)
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setSaved(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  const shownPhoto = preview || (profile.bodyPhotoUrl ? apiUrl(profile.bodyPhotoUrl) : null)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Profile"
        description="Body photo is used only for virtual try-on. Attributes help matching score outfits."
      />

      {loading ? (
        <div className="mt-10">
          <Spinner label="Loading profile…" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4 lg:grid-cols-12">
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm lg:col-span-4">
            <p className="text-sm font-semibold text-ink">Full-body photo</p>
            <p className="mt-1 text-xs text-muted">Stand straight, even lighting, full figure in frame.</p>
            <div className="mt-4 overflow-hidden rounded-xl bg-canvas">
              {shownPhoto ? (
                <img
                  src={shownPhoto}
                  alt="Full-body photo for virtual try-on"
                  className="aspect-[3/4] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center px-4 text-center text-sm text-muted">
                  No photo uploaded
                </div>
              )}
            </div>
            <div className="mt-4">
              <Dropzone
                id="body-photo"
                label="Replace photo"
                hint="JPEG, PNG, or WebP"
                compact
                disabled={saving}
                onFiles={onPhoto}
                onInvalid={() => setError('Only JPEG, PNG, or WebP for the body photo.')}
              />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm lg:col-span-8">
            <p className="text-sm font-semibold text-ink">Attributes</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Height (cm)" htmlFor="heightCm">
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
                  className={fieldClass}
                  placeholder="170"
                />
              </Field>
              <Field label="Weight (kg)" htmlFor="weightKg">
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
                  className={fieldClass}
                  placeholder="60"
                />
              </Field>
              <Field label="Gender" htmlFor="gender">
                <select
                  id="gender"
                  name="gender"
                  value={gender}
                  onChange={(event) => {
                    setGender(event.target.value)
                    setSaved(false)
                  }}
                  className={fieldClass}
                >
                  <option value="">Select</option>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Skin tone" htmlFor="skinTone">
                <select
                  id="skinTone"
                  name="skinTone"
                  value={skinTone}
                  onChange={(event) => {
                    setSkinTone(event.target.value)
                    setSaved(false)
                  }}
                  className={fieldClass}
                >
                  <option value="">Select</option>
                  {SKIN_TONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Preferred style" htmlFor="preferredStyle" className="sm:col-span-2">
                <select
                  id="preferredStyle"
                  name="preferredStyle"
                  value={preferredStyle}
                  onChange={(event) => {
                    setPreferredStyle(event.target.value)
                    setSaved(false)
                  }}
                  className={fieldClass}
                >
                  <option value="">Select</option>
                  {STYLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {error ? (
              <div className="mt-5">
                <ErrorNote message={error} />
              </div>
            ) : null}

            {saved ? (
              <p className="mt-5 text-sm font-medium text-success" role="status">
                Profile saved.
              </p>
            ) : null}

            <div className="mt-6">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}

const fieldClass =
  'mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy'

function Field({
  label,
  htmlFor,
  children,
  className = '',
}: {
  label: string
  htmlFor: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
    </div>
  )
}
