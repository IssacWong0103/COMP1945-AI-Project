import type { ReactNode } from 'react'

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-canvas px-2 py-0.5 text-[11px] font-medium text-navy">
      {children}
    </span>
  )
}
