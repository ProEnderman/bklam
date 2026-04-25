import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../api/types'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: Role[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Show loading only if we're actually loading and have no cached user
  // This prevents redirect to login during the brief moment after successful login
  if (loading && !user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    )
  }

  // Only redirect to login if we're sure user is not authenticated
  // Give a small grace period after login
  if (!user && !loading) {
    // Small delay to allow AuthProvider to update after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user && allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/403" replace />
  }

  return <>{children}</>
}
