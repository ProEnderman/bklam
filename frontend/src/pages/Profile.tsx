import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { User } from '../api/types'
import './Profile.css'

export default function Profile() {
  const { user: contextUser } = useOutletContext<{ user?: User }>()
  const { user: authUser } = useAuth()
  // Prefer context user if available (from Layout), otherwise use auth context
  const user = contextUser || authUser

  if (!user) {
    return <div>Loading...</div>
  }

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

  return (
    <div className="profile-container">
      <h1>Profile</h1>
      <div className="profile-card">
        <div className="profile-section">
          <h2>Personal Information</h2>
          <div className="profile-field">
            <label>Email</label>
            <div className="profile-value">{user.username}</div>
          </div>
          {user.firstName && (
            <div className="profile-field">
              <label>First Name</label>
              <div className="profile-value">{user.firstName}</div>
            </div>
          )}
          {user.lastName && (
            <div className="profile-field">
              <label>Last Name</label>
              <div className="profile-value">{user.lastName}</div>
            </div>
          )}
        </div>

        <div className="profile-section">
          <h2>Account Information</h2>
          <div className="profile-field">
            <label>Role</label>
            <div className="profile-value">{getRoleLabel(user.role)}</div>
          </div>
          {user.restaurantName && (
            <div className="profile-field">
              <label>Restaurant</label>
              <div className="profile-value">{user.restaurantName}</div>
            </div>
          )}
          <div className="profile-field">
            <label>Status</label>
            <div className="profile-value">
              <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

