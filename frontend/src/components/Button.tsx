import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition no-underline'

const STYLES: Record<Variant, string> = {
  primary: 'bg-navy text-white hover:bg-navy-deep disabled:hover:bg-navy',
  secondary: 'border border-line bg-surface text-ink hover:bg-canvas disabled:hover:bg-surface',
  ghost: 'text-navy hover:bg-canvas',
  danger: 'border border-red-200 bg-red-50 text-danger hover:bg-red-100',
}

export function Button({ variant = 'primary', className = '', children, ...props }: Props) {
  return (
    <button
      className={`${BASE} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${STYLES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function ButtonLink({
  to,
  variant = 'primary',
  className = '',
  disabled,
  children,
}: {
  to: string
  variant?: Variant
  className?: string
  disabled?: boolean
  children: ReactNode
}) {
  if (disabled) {
    return (
      <Button variant={variant} className={className} disabled>
        {children}
      </Button>
    )
  }
  return (
    <Link to={to} className={`${BASE} ${STYLES[variant]} ${className}`}>
      {children}
    </Link>
  )
}
