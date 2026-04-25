import { useEffect } from 'react'
import './Modal.css'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'small' | 'medium' | 'large' | 'xlarge'
  /** Если задано, клик по затемнению вызывает его вместо onClose (например, показать подтверждение) */
  onBackdropClick?: () => void
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  onBackdropClick,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="modal-overlay"
      onClick={() => (onBackdropClick ?? onClose)()}
    >
      <div
        className={`modal modal-${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

