import { useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { authService } from '../api/services'
import { AuthContext, type AuthContextType } from '../contexts/AuthContext'
import { startTokenRefreshTimer, markRefreshSuccess, ensureCsrfPrimed } from '../api/client'
import type { User } from '../api/types'

interface AuthProviderProps {
  children: ReactNode
}

const USER_CACHE_KEY = 'auth_user_cache'
const USER_CACHE_TIMESTAMP_KEY = 'auth_user_cache_timestamp'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Helper functions for caching
const getUserFromCache = (): User | null => {
  try {
    const cached = sessionStorage.getItem(USER_CACHE_KEY)
    const timestamp = sessionStorage.getItem(USER_CACHE_TIMESTAMP_KEY)
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp, 10)
      if (age < CACHE_DURATION) {
        return JSON.parse(cached)
      }
    }
  } catch (e) {
    console.warn('[AuthProvider] Failed to read user cache:', e)
  }
  return null
}

const setUserCache = (user: User | null) => {
  try {
    if (user) {
      sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
      sessionStorage.setItem(USER_CACHE_TIMESTAMP_KEY, Date.now().toString())
    } else {
      sessionStorage.removeItem(USER_CACHE_KEY)
      sessionStorage.removeItem(USER_CACHE_TIMESTAMP_KEY)
    }
  } catch (e) {
    console.warn('[AuthProvider] Failed to write user cache:', e)
  }
}

export default function AuthProvider({ children }: AuthProviderProps) {
  // Initialize with cached user for instant UI
  const [user, setUser] = useState<User | null>(getUserFromCache())
  const [loading, setLoading] = useState(true)
  const [authReady, setAuthReady] = useState(false) // true only after successful refresh+getMe
  const [lastErrorTime, setLastErrorTime] = useState<number>(0)
  const isRefreshingRef = useRef(false) // Флаг для предотвращения множественных одновременных вызовов (используем ref, чтобы не вызывать пересоздание функции)

  // Prime CSRF cookie on app load
  useEffect(() => { ensureCsrfPrimed() }, [])

  const refreshUser = useCallback(async (useCache = true) => {
    // Предотвращаем множественные одновременные вызовы
    if (isRefreshingRef.current) {
      console.log('[AuthProvider] Refresh already in progress, skipping duplicate call')
      return
    }

    isRefreshingRef.current = true
    
    try {
      // If we got a 429 recently, wait a bit before retrying
      const timeSinceLastError = Date.now() - lastErrorTime
      if (timeSinceLastError < 3000 && !useCache) { // Wait 3 seconds after a 429
        console.log('[AuthProvider] Waiting after rate limit error...')
        await new Promise(resolve => setTimeout(resolve, 3000 - timeSinceLastError))
      }

      // Ensure CSRF cookie is set before any POST (refresh is a POST)
      await ensureCsrfPrimed()

      // Обновляем access_token по refresh_token, чтобы первый же getMe() прошёл с валидным токеном
      try {
        await authService.refresh()
        markRefreshSuccess()
      } catch (_) {
        // Нет refresh_token или истёк — getMe() ниже вернёт 401, покажем логин
      }

      const userData = await authService.getMe()
      console.log('[AuthProvider] Successfully loaded user:', userData.username)
      setUser(userData)
      setUserCache(userData) // Cache the user
      setLastErrorTime(0) // Reset error time on success
      setAuthReady(true) // Token validated; safe for other components to call protected APIs
      
      // Запускаем таймер обновления токена, если пользователь успешно загружен
      // Это важно для перезапуска таймера после перезагрузки страницы
      startTokenRefreshTimer()
      console.log('[AuthProvider] Token refresh timer started')
    } catch (error: any) {
      const status = error?.response?.status
      const isAuthError = status === 401 || status === 403
      const isRateLimit = status === 429
      
      console.log(`[AuthProvider] getMe() failed:`, {
        status,
        isAuthError,
        isRateLimit,
        error: error?.message,
        url: error?.config?.url,
      })
      
      // If 401, the interceptor will try to refresh the token automatically
      // If refresh succeeds, the request will be retried automatically by the interceptor
      // We don't retry here to avoid 429 errors from too many requests
      
      if (isAuthError) {
        // Clear cache and set user to null - the interceptor will handle redirect if refresh fails
        console.log('[AuthProvider] Auth error, clearing cache and setting user to null. Interceptor will handle redirect.')
        setUser(null)
        setUserCache(null)
        setAuthReady(false)
        setLastErrorTime(0)
        // Don't navigate here - interceptor handles it to avoid race conditions
      } else if (isRateLimit) {
        // Rate limit - use cached user if available, otherwise keep existing user
        console.warn('[AuthProvider] Rate limit (429), using cached user if available.')
        setLastErrorTime(Date.now())
        
        // Try to get cached user if we don't have one
        // Используем функциональное обновление, чтобы не зависеть от user в замыкании
        setUser(currentUser => {
          const cachedUser = getUserFromCache()
          if (cachedUser && !currentUser) {
            console.log('[AuthProvider] Using cached user due to rate limit')
            return cachedUser
          }
          return currentUser
        })
        // Don't set user to null on rate limit - keep them logged in
        // Don't retry immediately - let the user continue using the app
      } else {
        // Keep existing user on transient errors (500, network, etc.)
        // Don't log out user on temporary server issues
        console.warn('[AuthProvider] Non-auth error during user refresh, keeping existing user:', {
          status,
          error: error?.message,
        })
        setLastErrorTime(0)
      }
    } finally {
      isRefreshingRef.current = false
    }
  }, [lastErrorTime]) // Убрали user и isRefreshing из зависимостей, используем функциональное обновление и ref

  useEffect(() => {
    const path = window.location.pathname
    const isPublicAnonymousRoute = path === '/telegram' || path === '/qr'
    if (isPublicAnonymousRoute) {
      setLoading(false)
      return
    }

    let isMounted = true
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    
    // Always try to refresh user, but use cache for instant UI
    const cachedUser = getUserFromCache()
    
    if (cachedUser) {
      // Set cached user immediately for instant UI
      setUser(cachedUser)
      setLoading(false)
      
      // Запускаем таймер обновления токена сразу, если есть кешированный пользователь
      // Это важно для перезапуска таймера после перезагрузки страницы
      startTokenRefreshTimer()
      console.log('[AuthProvider] Token refresh timer started (from cache)')
      
      // Refresh in background after a short delay
      // Reduced delay for faster updates after login
      timeoutId = setTimeout(() => {
        if (isMounted) {
          refreshUser(false)
            .then(() => {
              if (isMounted) {
                console.log('[AuthProvider] Background refresh successful')
              }
            })
            .catch((error: any) => {
              if (!isMounted) return
              
              // If refresh fails with 429, that's okay - we have cached user
              // If it fails with 401/403, we'll clear cache and redirect
              if (error?.response?.status === 401 || error?.response?.status === 403) {
                console.log('[AuthProvider] Background refresh failed with auth error, clearing cache')
                setUser(null)
                setUserCache(null)
                setAuthReady(false)
              } else {
                console.warn('[AuthProvider] Background refresh failed, keeping cached user:', error?.response?.status)
              }
            })
        }
      }, 500) // Reduced delay for faster updates
    } else {
      // No cached user, load immediately
      refreshUser(false).finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })
    }
    
    // Слушаем событие успешного логина
    const handleLoginSuccess = (event: CustomEvent) => {
      const loggedInUser = (event as any).detail?.user
      if (loggedInUser && isMounted) {
        console.log('[AuthProvider] Login success event received, updating user state')
        setUser(loggedInUser)
        setUserCache(loggedInUser)
        setLoading(false)
        startTokenRefreshTimer()
        // Сразу обновляем пользователя с сервера
        refreshUser(false).catch((error: any) => {
          console.warn('[AuthProvider] Failed to refresh user after login:', error)
        })
      }
    }
    
    window.addEventListener('auth:login-success', handleLoginSuccess as EventListener)
    
    return () => {
      isMounted = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      window.removeEventListener('auth:login-success', handleLoginSuccess as EventListener)
    }
  }, [refreshUser]) // Добавили refreshUser в зависимости, но он стабилен благодаря useCallback

  // Update cache whenever user changes
  useEffect(() => {
    setUserCache(user)
  }, [user])

  const clearUser = useCallback(() => {
    setUser(null)
    setUserCache(null)
    setAuthReady(false)
  }, [])

  const value: AuthContextType = {
    user,
    loading,
    authReady,
    refreshUser,
    clearUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

