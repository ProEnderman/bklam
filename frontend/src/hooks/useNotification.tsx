import { useState } from 'react'
import Notification, { NotificationType } from '../components/Notification'

export function useNotification() {
  const [notification, setNotification] = useState<{
    message: string
    type: NotificationType
  } | null>(null)

  const showNotification = (message: string, type: NotificationType) => {
    setNotification({ message, type })
  }

  const NotificationComponent = notification ? (
    <Notification
      message={notification.message}
      type={notification.type}
      onClose={() => setNotification(null)}
    />
  ) : null

  return { showNotification, NotificationComponent }
}

