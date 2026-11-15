import type { ReactNode } from 'react'

type BadgeProps = {
  id: string
  from: string
  to: string
  children: ReactNode
}

function Badge({ id, from, to, children }: BadgeProps) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-bg`} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <radialGradient
          id={`${id}-glow`}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(15 12) rotate(45) scale(30)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="14" fill={`url(#${id}-bg)`} />
      <rect x="2" y="2" width="44" height="44" rx="14" fill={`url(#${id}-glow)`} />
      <rect
        x="2.75"
        y="2.75"
        width="42.5"
        height="42.5"
        rx="13.25"
        fill="none"
        stroke="#fff"
        strokeOpacity=".28"
        strokeWidth="1.5"
      />
      {children}
    </>
  )
}

const ART: Record<string, ReactNode> = {
  lecture: (
    <Badge id="venue-lecture" from="#6366F1" to="#8B5CF6">
      <path
        d="M24 13 38 19 24 25 10 19Z"
        fill="#FDE68A"
        stroke="#F59E0B"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 22.2v5.1c0 2.8 15 2.8 15 0v-5.1"
        fill="#FBBF24"
        stroke="#D97706"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M38 19v7.4" stroke="#FEF3C7" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="38" cy="27.6" r="1.8" fill="#FEF3C7" />
      <path d="M24 13.4 31 16.4" stroke="#FFFBEB" strokeWidth="1.4" strokeLinecap="round" />
    </Badge>
  ),
  careerFair: (
    <Badge id="venue-careerFair" from="#0D9488" to="#22C55E">
      <path
        d="M19.5 17.5v-2.2a2.3 2.3 0 0 1 2.3-2.3h4.4a2.3 2.3 0 0 1 2.3 2.3v2.2"
        fill="none"
        stroke="#ECFDF5"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <rect x="10.5" y="17" width="27" height="19" rx="4" fill="#F0FDF4" />
      <rect x="21.5" y="17" width="5" height="19" fill="#FBBF24" />
      <rect x="21.5" y="24" width="5" height="4" rx="1" fill="#D97706" />
      <circle cx="24" cy="26" r="1.5" fill="#FFFBEB" />
      <path d="M13.5 20h6" stroke="#A7F3D0" strokeWidth="1.4" strokeLinecap="round" />
    </Badge>
  ),
  casualDate: (
    <Badge id="venue-casualDate" from="#FB7185" to="#F472B6">
      <path
        d="M24 35C13.5 28 12.2 19.8 17.8 16.6c3.2-1.8 6.2.4 6.2 2.8 0-2.4 3-4.6 6.2-2.8C35.8 19.8 34.5 28 24 35Z"
        fill="#FFF1F2"
        stroke="#FECDD3"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path d="M19.3 19.1c1.5-1.1 3.4-.6 4.3.5" stroke="#FDA4AF" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="m35 13.5 1.1 2.4 2.4 1.1-2.4 1.1L35 20.5l-1.1-2.4-2.4-1.1 2.4-1.1Z"
        fill="#FDE68A"
      />
      <path d="m12 23.5.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8Z" fill="#FDE68A" />
    </Badge>
  ),
  hallGathering: (
    <Badge id="venue-hallGathering" from="#F97316" to="#EF4444">
      <rect x="9.5" y="12" width="3.2" height="1.9" rx=".95" fill="#FDE68A" transform="rotate(-22 11.1 12.95)" />
      <rect x="28" y="10.8" width="3.2" height="1.9" rx=".95" fill="#FEF3C7" transform="rotate(24 29.6 11.75)" />
      <circle cx="36.2" cy="14.6" r="1.2" fill="#FFFBEB" />
      <circle cx="12.6" cy="18.8" r="1" fill="#FEF3C7" />
      <circle cx="18.5" cy="20.2" r="4.2" fill="#FFF7ED" />
      <path d="M11 33.4c0-4.7 3.4-7.5 7.5-7.5s7.5 2.8 7.5 7.5Z" fill="#FFEDD5" />
      <circle cx="30" cy="22.2" r="3.6" fill="#FDE68A" />
      <path d="M23.5 34c0-4 3-6.4 6.5-6.4s6.5 2.4 6.5 6.4Z" fill="#FBBF24" />
    </Badge>
  ),
  formal: (
    <Badge id="venue-formal" from="#4C1D95" to="#7C3AED">
      <path
        d="M24 24 13.5 17.5v13Z"
        fill="#FDE68A"
        stroke="#F59E0B"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M24 24 34.5 17.5v13Z"
        fill="#FDE68A"
        stroke="#F59E0B"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect x="21.5" y="20.8" width="5" height="6.4" rx="1.6" fill="#FBBF24" stroke="#D97706" strokeWidth="1" />
      <path
        d="m36 12.5 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1Z"
        fill="#FEF3C7"
      />
      <path d="m11 26.5.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8Z" fill="#FDE68A" />
    </Badge>
  ),
  default: (
    <Badge id="venue-default" from="#64748B" to="#94A3B8">
      <path
        d="m24 12 3.2 7.2 7.8.7-5.9 5.2 1.7 7.6L24 28.9l-6.8 3.8 1.7-7.6-5.9-5.2 7.8-.7Z"
        fill="#F8FAFC"
      />
    </Badge>
  ),
}

type Props = {
  venue: string
  className?: string
}

export function VenueIcon({ venue, className = 'h-10 w-10' }: Props) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      {ART[venue] ?? ART.default}
    </svg>
  )
}
