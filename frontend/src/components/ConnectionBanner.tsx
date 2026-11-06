type Props = {
  visible: boolean
}

export function ConnectionBanner({ visible }: Props) {
  if (!visible) return null

  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
      API is offline. Start the USTyle backend, then refresh.
    </div>
  )
}
