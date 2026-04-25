import type { User } from '../api/types'
import NotificationBell from './NotificationBell'
import TimeControl from './TimeControl'
import './Topbar.css'

interface TopbarProps {
  user: User
  onLogout: () => void
}

export default function Topbar({ user, onLogout }: TopbarProps) {
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'HEAD_ADMIN':
        return 'Head Admin'
      case 'ADMIN':
        return 'Admin'
      case 'REGULAR_WORKER':
        return 'Worker'
      default:
        return role
    }
  }

  const getUserDisplayName = () => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim()
    }
    return user.username
  }

  return (
    <header className="topbar">
      <div className="topbar-content">
        <div className="topbar-left">
          {user.restaurantName && (
            <span className="restaurant-badge">{user.restaurantName}</span>
          )}
        </div>
        <div className="topbar-right">
          {user.role === 'HEAD_ADMIN' && <TimeControl />}
          <NotificationBell />
          <div className="user-info">
            <span className="user-name">{getUserDisplayName()}</span>
            <span className="user-role">{getRoleLabel(user.role)}</span>
          </div>
          <button onClick={onLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
