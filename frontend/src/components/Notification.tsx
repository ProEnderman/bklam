import { useEffect } from 'react'
import './Notification.css'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

interface NotificationProps {
  message: string
  type: NotificationType
  onClose: () => void
  duration?: number
}

export default function Notification({
  message,
  type,
  onClose,
  duration = 3000,
}: NotificationProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div className={`notification notification-${type}`}>
      <span>{message}</span>
      <button onClick={onClose}>×</button>
    </div>
  )
}

