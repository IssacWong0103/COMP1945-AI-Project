import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ButtonLink } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { track } from '../lib/analytics'
import { listActivity } from '../lib/activityStore'

export function TryOnPage() {
  useEffect(() => {
    document.title = 'Try-On — USTyle'
    track('nav_tab_opened', { tab: 'try-on' })
  }, [])

  const sessions = useMemo(
    () =>
      listActivity(40).filter((item) =>
        ['tryon_started', 'tryon_ready', 'tryon_preview', 'tryon_failed'].includes(item.kind),
      ),
    [],
  )

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Try-On"
        description="Rendering queue and recent virtual try-on sessions. Start a try-on from Studio result cards."
        actions={<ButtonLink to="/studio">Open Studio</ButtonLink>}
      />

      <div className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-sm font-semibold text-ink">How it works</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Create outfits in Studio.</li>
          <li>Press Try on on a result card.</li>
          <li>Wait for rendering (you can keep browsing).</li>
          <li>Download or save a generated try-on. A local preview is labeled and is not that photo.</li>
        </ol>
      </div>

      <section className="mt-6">
        <h3 className="text-sm font-semibold text-ink">Recent sessions</h3>
        {sessions.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-10 text-sm text-muted">
            No try-on sessions yet.{' '}
            <Link to="/studio" className="font-semibold text-navy underline">
              Create a look
            </Link>{' '}
            to start one.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {sessions.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {item.title}
                    {item.kind === 'tryon_preview' ? (
                      <span className="ml-2 inline-flex rounded-md bg-ink px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-white">
                        Local preview
                      </span>
                    ) : null}
                  </p>
                  {item.detail ? <p className="text-xs text-muted">{item.detail}</p> : null}
                </div>
                <time className="shrink-0 text-xs text-muted">
                  {new Date(item.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
