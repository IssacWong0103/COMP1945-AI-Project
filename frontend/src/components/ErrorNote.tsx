type Props = {
  message: string
  title?: string
}

export function ErrorNote({ message, title = 'Something went wrong' }: Props) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
      <p className="font-semibold text-danger">{title}</p>
      <p className="mt-1 leading-relaxed text-ink/80">{message}</p>
    </div>
  )
}
