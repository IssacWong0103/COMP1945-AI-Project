import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getHealth } from '../api/client'
import { ConnectionBanner } from './ConnectionBanner'

const LINKS = [
  { to: '/', label: 'Dashboard', end: true, icon: DashboardIcon },
  { to: '/wardrobe', label: 'Wardrobe', end: false, icon: WardrobeIcon },
  { to: '/dress-me', label: 'Generate', end: false, icon: GenerateIcon },
  { to: '/you', label: 'Profile', end: false, icon: ProfileIcon },
] as const

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/wardrobe': 'Wardrobe',
  '/dress-me': 'Generate outfits',
  '/you': 'Profile',
}

export function Layout() {
  const location = useLocation()
  const [backendUp, setBackendUp] = useState<boolean | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy text-white transition-transform lg:static lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : 'max-lg:-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold text-sm font-bold text-navy">
            US
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-tight">USTyle</p>
            <p className="text-[11px] text-white/55">HKUST · Group 18</p>
          </div>
        </div>

        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 px-3">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition ${
                  isActive ? 'bg-white/12 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              <link.icon />
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="mx-3 mb-4 rounded-lg bg-white/8 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">System</p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${backendUp ? 'bg-emerald-400' : backendUp === false ? 'bg-red-400' : 'bg-white/40'}`}
            />
            {backendUp ? 'API connected' : backendUp === false ? 'API offline' : 'Checking API…'}
          </p>
          <p className="mt-1 text-[12px] text-white/50">Local demo · no login</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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
      <rect x="3" y="3" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.5" y="3" width="6.5" height="4" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11.5" width="6.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.5" y="9" width="6.5" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function WardrobeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M6 5.5h8v11H6z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 5.5V4M8.5 9v3M11.5 9v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function GenerateIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M4 14.5 10 4l6 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.5 14.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <circle cx="10" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 16c.8-2.6 2.8-4 5.5-4s4.7 1.4 5.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
