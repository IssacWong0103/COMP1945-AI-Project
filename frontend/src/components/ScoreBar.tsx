type Props = {
  label: string
  value: number
}

export function ScoreBar({ label, value }: Props) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const pct = Math.round(clamped * 100)

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-semibold tabular-nums text-ink">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
        <div className="h-full rounded-full bg-navy transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
