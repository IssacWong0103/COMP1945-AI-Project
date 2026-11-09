import { apiUrl } from '../api/client'

/** Solid label on the image. Collage footer text is easy to crop, so this stays on the photo. */
export function LocalPreviewBadge() {
  return (
    <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-ink px-2 py-1 text-xs font-semibold tracking-wide text-white shadow-sm">
      Local preview
    </span>
  )
}

export function ResultImage({
  src,
  alt,
  resultKind,
  className = '',
}: {
  src: string
  alt: string
  resultKind?: 'generated' | 'collage' | null
  className?: string
}) {
  return (
    <div className="relative">
      <img src={apiUrl(src)} alt={alt} className={className} />
      {resultKind === 'collage' ? <LocalPreviewBadge /> : null}
    </div>
  )
}
