import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './ExcelHoverHint.css'

type Props = {
  hint: string
  /** When tooltip is narrower than viewport, align to anchor */
  placement?: 'below' | 'above'
  children: React.ReactNode
}

export default function ExcelHoverHint({ hint, placement = 'below', children }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const cancelCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const scheduleClose = () => {
    cancelCloseTimer()
    closeTimerRef.current = setTimeout(() => setOpen(false), 160)
  }

  useEffect(() => () => cancelCloseTimer(), [])

  const reposition = useCallback(() => {
    const el = anchorRef.current
    const tip = tipRef.current
    if (!el || !tip || !open) return

    const rect = el.getBoundingClientRect()
    const gutter = 8
    let top = placement === 'below' ? rect.bottom + gutter : 0
    if (placement === 'above') {
      const tipH = tip.offsetHeight || 200
      top = rect.top - tipH - gutter
      if (top < gutter) {
        top = rect.bottom + gutter
      }
    }

    const tipWidth = tip.offsetWidth
    let left = rect.left + rect.width / 2 - tipWidth / 2
    left = Math.max(gutter, Math.min(left, window.innerWidth - tipWidth - gutter))

    if (placement === 'below') {
      const tipH = tip.offsetHeight || 200
      if (top + tipH > window.innerHeight - gutter) {
        top = Math.max(gutter, rect.top - tipH - gutter)
      }
    }

    setPos({ top, left })
  }, [open, placement])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    const id = window.requestAnimationFrame(() => reposition())
    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, hint, reposition])

  return (
    <div
      ref={anchorRef}
      className="excel-hint-anchor"
      onMouseEnter={() => {
        cancelCloseTimer()
        setOpen(true)
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => {
        cancelCloseTimer()
        setOpen(true)
      }}
      onBlur={() => scheduleClose()}
    >
      {children}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tipRef}
            className="excel-hint-tooltip"
            style={{ top: pos.top, left: pos.left }}
            role="tooltip"
            aria-live="polite"
            onMouseEnter={cancelCloseTimer}
            onMouseLeave={scheduleClose}
          >
            {hint}
          </div>,
          document.body,
        )}
    </div>
  )
}
