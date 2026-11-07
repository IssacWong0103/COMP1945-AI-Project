import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getHealth } from '../api/client'
import { ConnectionBanner } from './ConnectionBanner'

const LINKS = [
  { to: '/', label: 'Home', end: true, icon: DashboardIcon },
  { to: '/wardrobe', label: 'Closet', end: false, icon: ClosetIcon },
  { to: '/dress-me', label: 'Studio', end: false, icon: GenerateIcon },
  { to: '/you', label: 'Me', end: false, icon: ProfileIcon },
] as const

const TITLES: Record<string, string> = {
  '/': 'Home',
  '/wardrobe': 'Closet',
  '/dress-me': 'Studio',
  '/you': 'Me',
}

export function Layout() {
  const location = useLocation()
  const [backendUp, setBackendUp] = useState<boolean | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const isHome = location.pathname === '/'
  const flushHeader = isHome || location.pathname === '/wardrobe' || location.pathname === '/you'

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const health = await getHealth()
        if (!cancelled) setBackendUp(health.status === 'ok')
      } catch {
        if (!cancelled) setBackendUp(false)
      }
    }

    void check()
    const id = window.setInterval(() => void check(), 15000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const pageTitle = TITLES[location.pathname] ?? 'USTyle'

  return (
    <div className="min-h-svh bg-canvas lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-gold focus:px-3 focus:py-2 focus:text-navy"
      >
        Skip to content
      </a>

      {menuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-svh w-[240px] flex-col bg-sidebar text-white transition-transform lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : 'max-lg:-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 pt-6 pb-7">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gold text-lg font-bold text-navy">
            U
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">USTyle</p>
            <p className="mt-0.5 text-[11px] leading-snug text-white/55">
              HKUST student outfit
              <br />
              assistant
            </p>
          </div>
        </div>

        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 px-3">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition ${
                  isActive ? 'bg-white/12 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              <link.icon />
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-3">
          <div className="rounded-xl bg-white/8 px-3.5 py-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span
                className={`h-2 w-2 rounded-full ${
                  backendUp ? 'bg-emerald-400' : backendUp === false ? 'bg-red-400' : 'bg-white/40'
                }`}
              />
              {backendUp ? 'API connected' : backendUp === false ? 'API offline' : 'Checking API…'}
            </p>
            <p className="mt-0.5 pl-4 text-[12px] text-white/50">
              {backendUp
                ? 'Your workspace is connected'
                : backendUp === false
                  ? 'Your workspace is offline'
                  : 'Checking workspace…'}
            </p>
          </div>
          <p className="px-1 pt-3 text-[11px] text-white/40">Group 18 · COMP1945</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:ml-[240px]">
        {flushHeader ? (
          <header className="sticky top-0 z-20 flex items-center gap-3 bg-canvas px-4 py-3 lg:hidden">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-navy"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <MenuIcon />
            </button>
            <p className="text-sm font-semibold text-ink">USTyle</p>
          </header>
        ) : (
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-navy lg:hidden"
                aria-label="Open menu"
                onClick={() => setMenuOpen(true)}
              >
                <MenuIcon />
              </button>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Workspace</p>
                <h1 className="text-base font-semibold text-ink">{pageTitle}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-canvas px-3 py-1 text-xs font-medium text-muted sm:inline">
                Student demo
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
                HK
              </span>
            </div>
          </header>
        )}

        <ConnectionBanner visible={backendUp === false} />

        <main id="main" className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden>
      <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <rect x="3" y="3" width="6.2" height="6.2" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.8" y="3" width="6.2" height="6.2" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="10.8" width="6.2" height="6.2" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.8" y="10.8" width="6.2" height="6.2" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function ClosetIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M7.2 4.8 10 7.2 12.8 4.8 16 7.1v8.7H4V7.1L7.2 4.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 7.2v8.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function GenerateIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M10 3.2 11.15 7.1 15 8.2 11.15 9.3 10 13.2 8.85 9.3 5 8.2l3.85-1.1L10 3.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M14.6 12.4v3.2M13 14h3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <circle cx="10" cy="7.2" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.8 16c.7-2.5 2.6-3.8 5.2-3.8s4.5 1.3 5.2 3.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
