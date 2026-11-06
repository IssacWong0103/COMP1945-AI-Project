import { useId, useState, type DragEvent, type ChangeEvent } from 'react'
import { IMAGE_ACCEPT, isAllowedImage } from '../constants'

type Props = {
  id?: string
  label: string
  hint?: string
  multiple?: boolean
  disabled?: boolean
  compact?: boolean
  onFiles: (files: File[]) => void
  onInvalid?: (names: string[]) => void
}

export function Dropzone({
  id,
  label,
  hint,
  multiple = false,
  disabled = false,
  compact = false,
  onFiles,
  onInvalid,
}: Props) {
  const autoId = useId()
  const inputId = id ?? autoId
  const [over, setOver] = useState(false)

  function take(list: FileList | File[]) {
    const files = Array.from(list)
    const valid = files.filter(isAllowedImage)
    const invalid = files.filter((file) => !isAllowedImage(file)).map((file) => file.name)
    if (invalid.length) onInvalid?.(invalid)
    if (valid.length) onFiles(multiple ? valid : valid.slice(0, 1))
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    if (!disabled) setOver(true)
  }

  function onDragLeave() {
    setOver(false)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setOver(false)
    if (disabled) return
    if (event.dataTransfer.files.length) take(event.dataTransfer.files)
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) take(event.target.files)
    event.target.value = ''
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center transition ${
        compact ? 'px-4 py-6' : 'px-5 py-8'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${
        over ? 'border-navy bg-navy/5' : 'border-line bg-surface hover:border-navy/40 hover:bg-canvas'
      }`}
    >
      <input
        id={inputId}
        type="file"
        className="sr-only"
        accept={IMAGE_ACCEPT}
        multiple={multiple}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-canvas text-navy">
        <UploadIcon />
      </span>
      <span className="mt-3 text-sm font-semibold text-ink">{label}</span>
      {hint ? <span className="mt-1 text-sm text-muted">{hint}</span> : null}
      <span className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
        JPEG · PNG · WebP
      </span>
    </label>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M10 13.5V4M10 4 7 7M10 4l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 13.5V16h12v-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
