import { useEffect, useMemo, useRef, useState } from 'react'
import './SearchableSingleSelect.css'

type Primitive = string | number

export type SearchableSingleSelectOption<T extends Primitive> = {
  value: T | null
  label: string
  disabled?: boolean
}

export type SearchableSingleSelectProps<T extends Primitive> = {
  value: T | null
  options: SearchableSingleSelectOption<T>[]
  onChange: (value: T | null) => void
  maxVisibleItems?: number
  placeholder?: string
  nothingFoundText?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
}

export default function SearchableSingleSelect<T extends Primitive>({
  value,
  options,
  onChange,
  maxVisibleItems = 4,
  placeholder,
  nothingFoundText = 'Ничего не найдено',
  searchPlaceholder = 'Поиск...',
  className = '',
  disabled = false,
}: SearchableSingleSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (disabled) {
      setIsOpen(false)
      setQuery('')
    }
  }, [disabled])
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selectedOption = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])
  const fieldLabel = selectedOption?.label ?? placeholder ?? ''

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!isOpen || disabled) return

    // Focus search input when dropdown opens
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [isOpen, disabled])

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current
      if (!el) return
      if (!el.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen && !disabled) {
      document.addEventListener('mousedown', onDocMouseDown)
      return () => document.removeEventListener('mousedown', onDocMouseDown)
    }
  }, [isOpen, disabled])

  const handleSelect = (opt: SearchableSingleSelectOption<T>) => {
    if (opt.disabled) return
    onChange(opt.value)
    setIsOpen(false)
    setQuery('')
  }

  return (
    <div
      ref={rootRef}
      className={`searchable-single-select hall-searchable-select ${className}`.trim()}
    >
      <div
        className={`hall-searchable-trigger ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
        onClick={() => !disabled && setIsOpen((p) => !p)}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen((p) => !p)
          }
          if (e.key === 'Escape') {
            setIsOpen(false)
          }
        }}
      >
        <div className="hall-searchable-trigger-label">{fieldLabel || '(Выберите)'}</div>
        <div className="hall-searchable-trigger-chevron">{isOpen ? '▲' : '▼'}</div>
      </div>

      {isOpen && !disabled && (
        <div className="hall-searchable-dropdown" role="dialog" onClick={(e) => e.stopPropagation()}>
          <div className="hall-searchable-search">
            <input
              ref={inputRef}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={searchPlaceholder}
              aria-label="Поиск"
            />
          </div>

          <div
            className="hall-searchable-list"
            style={{ maxHeight: `${maxVisibleItems * 40 + 8}px` }}
            role="listbox"
          >
            {filteredOptions.length === 0 ? (
              <div className="hall-searchable-empty">{nothingFoundText}</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <div
                    key={String(opt.value) + opt.label}
                    className={[
                      'hall-searchable-item',
                      isSelected ? 'selected' : '',
                      opt.disabled ? 'disabled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt)}
                  >
                    {opt.label}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

