type Props = {
  label: string
}

export function Spinner({ label }: Props) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted" role="status">
      <span
        className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-navy"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  )
}
