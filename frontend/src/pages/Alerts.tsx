import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getHealth } from '../api/client'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { track } from '../lib/analytics'
import {
  dismissAlert,
  listAlerts,
  pushAlert,
  type AlertItem,
} from '../lib/activityStore'

export function Alerts() {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)

  function refresh() {
    setAlerts(listAlerts())
  }

  useEffect(() => {
    document.title = 'Alerts — USTyle'
    track('nav_tab_opened', { tab: 'alerts' })
    refresh()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const health = await getHealth()
        if (cancelled) return
        const online = health.status === 'ok'
        setApiOnline(online)
        if (!online) {
          pushAlert({
            severity: 'error',
            title: 'API offline',
            detail: 'USTyle server is not responding.',
            href: '/alerts',
          })
          refresh()
        }
      } catch {
        if (cancelled) return
        setApiOnline(false)
        pushAlert({
          severity: 'error',
          title: 'API offline',
          detail: 'Could not reach /api/health.',
          href: '/alerts',
        })
        refresh()
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Alerts"
        description="API offline, failed runs, and try-on render failures — each with one clear next step."
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void getHealth()
                .then((health) => setApiOnline(health.status === 'ok'))
                .catch(() => setApiOnline(false))
              refresh()
            }}
          >
            Refresh
          </Button>
        }
      />

      <div
        className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
          apiOnline
            ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
            : apiOnline === false
              ? 'border-red-200 bg-red-50 text-red-950'
              : 'border-line bg-surface text-muted'
        }`}
      >
        {apiOnline
          ? 'API connected'
          : apiOnline === false
            ? 'API offline — start the backend on port 8018.'
            : 'Checking API…'}
      </div>

      {alerts.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
          No active alerts. Failed Studio runs and try-ons will appear here.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`rounded-xl border px-4 py-3 ${
                alert.severity === 'error'
                  ? 'border-red-200 bg-red-50'
                  : alert.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-line bg-surface'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{alert.title}</p>
                  <p className="mt-1 text-sm text-muted">{alert.detail}</p>
                  <p className="mt-2 text-xs text-muted">{new Date(alert.at).toLocaleString()}</p>
                  {alert.href ? (
                    <Link to={alert.href} className="mt-2 inline-block text-sm font-semibold text-navy">
                      Take action
                    </Link>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    dismissAlert(alert.id)
                    refresh()
                  }}
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
