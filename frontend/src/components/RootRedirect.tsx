import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RootRedirect() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading } = useAuth()
  const hasNavigatedRef = useRef(false) // Предотвращаем множественные навигации

  useEffect(() => {
    // Предотвращаем множественные навигации
    if (hasNavigatedRef.current) {
      return
    }

    if (!loading) {
      if (user) {
        // Проверяем, не находимся ли мы уже на правильной странице
        const isOnPlatform = location.pathname === '/platform' || location.pathname.startsWith('/platform/')
        
        if (user.role === 'HEAD_ADMIN' && !isOnPlatform) {
          hasNavigatedRef.current = true
          navigate('/platform', { replace: true })
        } else if (location.pathname === '/') {
          // На корневой странице редирект: платформа или заказы ресторана
          hasNavigatedRef.current = true
          if (user.role === 'HEAD_ADMIN') {
            navigate('/platform', { replace: true })
          } else {
            navigate('/home', { replace: true })
          }
        }
      } else {
        // Не навигируем на /login, если уже там
        if (location.pathname !== '/login') {
          hasNavigatedRef.current = true
          navigate('/login', { replace: true })
        }
      }
    }
  }, [user, loading, navigate, location.pathname])

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    )
}

