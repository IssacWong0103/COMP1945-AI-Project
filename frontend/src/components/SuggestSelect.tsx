import { useEffect, useState } from 'react'

export const CUSTOM_SELECT = '__custom__'

const SELECT_CLASS =
  'w-full appearance-none rounded-xl border border-line bg-surface px-3.5 py-2.5 pr-10 text-sm text-ink outline-none transition focus:border-navy'

const INPUT_CLASS =
  'mt-2 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-navy'

type Option = { value: string; label: string }

type Props = {
  id: string
  name: string
  value: string
  options: readonly Option[]
  onChange: (value: string) => void
  placeholder?: string
  customLabel?: string
  customPlaceholder?: string
  customHint?: string
  disabled?: boolean
}

export function SuggestSelect({
  id,
  name,
  value,
  options,
  onChange,
  placeholder = 'Select',
  customLabel = 'Something else…',
  customPlaceholder = 'Type your own',
  customHint,
  disabled = false,
}: Props) {
  const isPreset = options.some((option) => option.value === value)
  const [customOpen, setCustomOpen] = useState(() => Boolean(value) && !isPreset)

  useEffect(() => {
    if (isPreset) {
      setCustomOpen(false)
    } else if (value) {
      setCustomOpen(true)
    }
  }, [isPreset, value])

  const selectValue = customOpen ? CUSTOM_SELECT : value

  return (
    <div>
      <div className="relative">
        <select
          id={id}
          name={name}
          value={selectValue}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value
            if (next === CUSTOM_SELECT) {
              setCustomOpen(true)
              if (isPreset) onChange('')
              return
            }
            setCustomOpen(false)
            onChange(next)
          }}
          className={SELECT_CLASS}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value={CUSTOM_SELECT}>{customLabel}</option>
        </select>
        <Chevron />
      </div>
      {customOpen ? (
        <div>
          <input
            id={`${id}-custom`}
            type="text"
            maxLength={80}
            value={isPreset ? '' : value}
            disabled={disabled}
            placeholder={customPlaceholder}
            onChange={(event) => onChange(event.target.value)}
            className={INPUT_CLASS}
          />
          {customHint ? <p className="mt-1.5 text-xs text-muted">{customHint}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      fill="none"
      aria-hidden
    >
      <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
