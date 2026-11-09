import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { track } from '../lib/analytics'
import { listActivity, type ActivityItem } from '../lib/activityStore'

const KIND_LABEL: Record<string, string> = {
  run_started: 'Run',
  run_completed: 'Run',
  run_failed: 'Run',
  run_partial: 'Run',
  tryon_started: 'Try-on',
  tryon_ready: 'Try-on',
  tryon_preview: 'Preview',
  tryon_failed: 'Try-on',
  swap_applied: 'Swap',
  look_saved: 'Looks',
  look_removed: 'Looks',
  alert: 'Alert',
}

export function Activity() {
  const [items, setItems] = useState<ActivityItem[]>([])

  useEffect(() => {
    document.title = 'Activity — USTyle'
    track('nav_tab_opened', { tab: 'activity' })
    setItems(listActivity())
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Activity"
        description="Recent Studio actions: generated, swapped, tried on, saved, and failed runs."
      />

      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          No activity yet. Create an outfit in{' '}
          <Link to="/studio" className="font-semibold text-navy underline">
            Studio
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {KIND_LABEL[item.kind] ?? 'Event'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{item.title}</p>
                {item.detail ? <p className="text-xs text-muted">{item.detail}</p> : null}
                {item.href ? (
                  <Link to={item.href} className="mt-1 inline-block text-xs font-semibold text-navy">
                    Open
                  </Link>
                ) : null}
              </div>
              <time className="shrink-0 text-xs text-muted">
                {new Date(item.at).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
