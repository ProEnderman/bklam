import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { authService } from '../api/services'

import Sidebar from './Sidebar'
import Topbar from './Topbar'
import './Layout.css'

export default function Layout() {
  const { user, clearUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // User is guaranteed to exist here because ProtectedRoute already checked
  if (!user) {
    return null // This should never happen, but just in case
  }

  const handleLogout = async () => {
    try {
      await authService.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      clearUser() // so Login page shows instead of redirecting back
      navigate('/login')
    }
  }


  // Определяем, какая навигация нужна
  const isPlatformRoute = location.pathname.startsWith('/platform')
  // Для HEAD_ADMIN показываем платформенное меню везде
  const showPlatformNav = user.role === 'HEAD_ADMIN'
  const showRestaurantNav = (user.role === 'ADMIN' || user.role === 'REGULAR_WORKER') && !isPlatformRoute

  return (
    <div className="layout">
      <Sidebar user={user} showPlatformNav={showPlatformNav} showRestaurantNav={showRestaurantNav} />
      <div className="layout-content">
        <Topbar user={user} onLogout={handleLogout} />
        <main className="main-content">
          <Outlet context={{ user }} />
        </main>
      </div>
    </div>
  )
}
