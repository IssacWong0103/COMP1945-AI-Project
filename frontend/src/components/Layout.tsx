import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getHealth, getProfile, listWardrobeItems } from '../api/client'
import { track } from '../lib/analytics'
import { ConnectionBanner } from './ConnectionBanner'

type NavItem = {
  to: string
  label: string
  end?: boolean
  icon: () => ReactNode
  section?: 'primary' | 'system'
}

const PRIMARY_LINKS: NavItem[] = [
  { to: '/', label: 'Home', end: true, icon: HomeIcon, section: 'primary' },
  { to: '/wardrobe', label: 'Closet', icon: ClosetIcon, section: 'primary' },
  { to: '/studio', label: 'Studio', icon: StudioIcon, section: 'primary' },
  { to: '/try-on', label: 'Try-On', icon: TryOnIcon, section: 'primary' },
  { to: '/looks', label: 'Looks', icon: LooksIcon, section: 'primary' },
]

const SYSTEM_LINKS: NavItem[] = [
  { to: '/profile', label: 'Profile', icon: SettingsIcon, section: 'system' },
  { to: '/eval', label: 'Evaluation', icon: EvalIcon, section: 'system' },
]

const TITLES: Record<string, string> = {
  '/': 'Home',
  '/wardrobe': 'Closet',
  '/studio': 'Studio',
  '/dress-me': 'Studio',
  '/looks': 'Looks',
  '/try-on': 'Try-On',
  '/profile': 'Profile',
  '/eval': 'Evaluation',
}

export function Layout() {
  const location = useLocation()
  const [backendUp, setBackendUp] = useState<boolean | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [setupDone, setSetupDone] = useState<number | null>(null)
  const isHome = location.pathname === '/'
  const flushHeader =
    isHome || location.pathname === '/wardrobe' || location.pathname === '/profile'

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

  useEffect(() => {
    let cancelled = false
    async function loadSetup() {
      try {
        const [items, profile] = await Promise.all([listWardrobeItems(), getProfile()])
        if (cancelled) return
        const done = [
          items.length >= 2,
          Boolean(profile.bodyPhotoUrl),
          Boolean(profile.heightCm && profile.preferredStyle),
        ].filter(Boolean).length
        setSetupDone(done)
      } catch {
        if (!cancelled) setSetupDone(null)
      }
    }
    void loadSetup()
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  const pageTitle = TITLES[location.pathname] ?? 'USTyle'

  function renderLink(link: NavItem) {
    return (
      <NavLink
        key={link.to}
        to={link.to}
        end={link.end}
        onClick={() => track('nav_tab_opened', { tab: link.label.toLowerCase() })}
        className={({ isActive }) =>
          `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium no-underline transition ${
            isActive ? 'bg-navy text-white' : 'text-muted hover:bg-canvas hover:text-ink'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <link.icon />
            <span className="flex-1">{link.label}</span>
            {isActive ? <span className="h-4 w-[3px] rounded-full bg-gold" aria-hidden /> : null}
          </>
        )}
      </NavLink>
    )
  }

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
        className={`fixed inset-y-0 left-0 z-40 flex h-svh w-[208px] flex-col border-r border-line bg-white transition-transform lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : 'max-lg:-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy text-white">
            <LogoShirtIcon />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold tracking-tight text-navy">USTyle</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">
              HKUST student outfit
              <br />
              assistant
            </p>
          </div>
        </div>

        <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-3">
          <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Create
          </p>
          {PRIMARY_LINKS.map(renderLink)}
          <p className="mt-3 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            System
          </p>
          {SYSTEM_LINKS.map(renderLink)}
        </nav>

        <div className="px-4 pb-4">
          {setupDone !== null && setupDone < 3 ? (
            <div className="mb-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Setup · {setupDone} of 3 done
              </p>
              <div className="mt-2 h-px bg-line" />
              <p className="mt-2 text-[12px] text-muted">A little setup, easier mornings.</p>
            </div>
          ) : null}
          <p
            className={`flex items-center gap-2 text-[13px] font-medium ${
              backendUp ? 'text-success' : backendUp === false ? 'text-danger' : 'text-muted'
            }`}
          >
            {backendUp ? (
              <CheckIcon />
            ) : (
              <span
                className={`h-2 w-2 rounded-full ${
                  backendUp === false ? 'bg-red-400' : 'bg-slate-300'
                }`}
              />
            )}
            {backendUp ? 'API connected' : backendUp === false ? 'API offline' : 'Checking API…'}
          </p>
          <p className="mt-2 text-[11px] text-muted">Group 18</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:ml-[208px]">
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
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5 lg:px-6">
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
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                  Workspace
                </p>
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

        <main id="main" className="flex-1 px-4 py-5 lg:px-6 lg:py-6">
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

function LogoShirtIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M7.1 4.6 10 7.2 12.9 4.6 16.2 7v8.8H3.8V7L7.1 4.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 7.2v8.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M3.6 9.2 10 3.8 16.4 9.2V16c0 .7-.5 1.2-1.2 1.2H4.8A1.2 1.2 0 0 1 3.6 16V9.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 17.2v-4.4h4v4.4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
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

function StudioIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <rect x="3.2" y="4" width="13.6" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.2 4v12M3.2 9.2h5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function LooksIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M4 6.5h12v9.2A1.3 1.3 0 0 1 14.7 17H5.3A1.3 1.3 0 0 1 4 15.7V6.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M7 6.5V5.2A1.2 1.2 0 0 1 8.2 4h3.6A1.2 1.2 0 0 1 13 5.2V6.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function TryOnIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <circle cx="10" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.5 16.5v-2.2c0-2.1 2-3.8 4.5-3.8s4.5 1.7 4.5 3.8v2.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 3.4v1.4M10 15.2v1.4M3.4 10h1.4M15.2 10h1.4M5.3 5.3l1 1M13.7 13.7l1 1M14.7 5.3l-1 1M6.3 13.7l-1 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EvalIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <rect x="3" y="4" width="14" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.2 12.5v-3M10 12.5v-6M13.8 12.5v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.2 8.1 7.1 10l3.7-4.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
