import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { TOP_GLOBAL_TABS } from '../studio/actionLayout'

type Props = {
  title?: string
  description?: string
  activeTab?: 'create' | 'saved'
  children: ReactNode
  aside?: ReactNode
}

export function StudioShell({
  title = 'Studio',
  description = 'Plan where you’re going, create looks from your closet, then try on and save.',
  activeTab = 'create',
  children,
  aside,
}: Props) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        </div>
        <div
          className="inline-flex rounded-full border border-line bg-surface p-1"
          role="tablist"
          aria-label="Studio views"
        >
          {TOP_GLOBAL_TABS.map((tab) => {
            const selected = tab.id === activeTab
            return (
              <NavLink
                key={tab.id}
                to={tab.path}
                role="tab"
                aria-selected={selected}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold no-underline transition ${
                  selected ? 'bg-navy text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {tab.label}
              </NavLink>
            )
          })}
        </div>
      </div>

      {aside ? <div className="mt-4">{aside}</div> : null}
      <div className="mt-6">{children}</div>
    </div>
  )
}
