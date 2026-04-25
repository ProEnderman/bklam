import axios, { AxiosError } from 'axios'
import { getOffsetMs } from '../utils/timeOverride'

// Используем относительный путь, так как Vite проксирует /api на backend
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

// Ensure CSRF cookie is set (GET /auth/csrf). Call before first POST/PUT/PATCH/DELETE to avoid 403 on fast first click.
let csrfPrimePromise: Promise<void> | null = null
export function ensureCsrfPrimed(): Promise<void> {
  if (!csrfPrimePromise) {
    csrfPrimePromise = fetch(`${API_BASE_URL}/auth/csrf`, { method: 'GET', credentials: 'include' })
      .catch(() => {})
      .then(() => {})
  }
  return csrfPrimePromise
}

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Важно для работы с HttpOnly cookies
})

// Флаг для предотвращения одновременных refresh запросов
let isRefreshing = false
let refreshPromise: Promise<any> | null = null
let failedQueue: Array<{
  resolve: (value: any) => void
  reject: (error: any) => void
  config: any
}> = []
let redirectingToLogin = false // Флаг для предотвращения множественных редиректов

const DEBUG_AUTH = typeof import.meta !== 'undefined' && import.meta.env?.DEV && (typeof window === 'undefined' || (window as any).__DEBUG_AUTH__)

// Track last successful token refresh so we can proactively refresh before expiry
let lastRefreshSuccessMs = 0
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes (matches backend)
const REFRESH_BUFFER_MS = 2 * 60 * 1000    // refresh 2 min before expiry

function markRefreshSuccess() {
  lastRefreshSuccessMs = Date.now()
}
function isTokenLikelyExpired(): boolean {
  if (lastRefreshSuccessMs === 0) return false // unknown → let server decide
  return Date.now() - lastRefreshSuccessMs > ACCESS_TOKEN_TTL_MS - REFRESH_BUFFER_MS
}

function getCookie(name: string): string {
  const match = document.cookie.split('; ').find((row) => row.startsWith(name + '='))
  const value = match?.split('=')[1]
  return value ? decodeURIComponent(value) : ''
}

const processQueue = (error: any) => {
  const queue = failedQueue
  failedQueue = []

  queue.forEach((prom) => {
    if (error) {
      prom.reject(error)
      return
    }

    // Retry the original request and resolve with the actual axios response
    client(prom.config)
      .then(prom.resolve)
      .catch(prom.reject)
  })
}

const redirectToLogin = () => {
  // Предотвращаем множественные редиректы
  if (redirectingToLogin || typeof window === 'undefined') return
  if (window.location.pathname === '/login' || window.location.pathname.startsWith('/login')) return

  redirectingToLogin = true
  // Очищаем все токены и таймеры
  stopTokenRefreshTimer()
  // Редирект на логин
  window.location.href = '/login'
}

// Функция для проверки и обновления токена перед истечением
let refreshInterval: ReturnType<typeof setTimeout> | null = null

export const startTokenRefreshTimer = () => {
  // Очищаем предыдущий интервал, если есть
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
  
  // Проверяем каждые 13 минут (за 2 минуты до истечения 15 минут)
  // Это гарантирует, что токен будет обновлен до истечения
  refreshInterval = setInterval(async () => {
    try {
      await client.post('/auth/refresh')
      markRefreshSuccess()
      if (DEBUG_AUTH) console.log('Token refreshed proactively')
    } catch (error: any) {
      console.warn('Failed to proactively refresh token:', error)
      // Если refresh не удался (401), останавливаем интервал и редиректим
      if (error.response?.status === 401) {
        stopTokenRefreshTimer()
        redirectToLogin()
      }
    }
  }, 13 * 60 * 1000) // 13 минут
}

export { markRefreshSuccess }

export const stopTokenRefreshTimer = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

// Request interceptor - проверяем и обновляем токен перед запросами, если нужно
client.interceptors.request.use(
  async (config) => {
    const requestUrl = (config.url || '').toString()
    const isAuthEndpoint =
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/login/') ||
      requestUrl.includes('/auth/logout')

    // CSRF: prime cookie if missing so first mutating request has the token (backend sets cookie on GET /api/auth/csrf)
    const method = (config.method || 'get').toUpperCase()
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      let token = getCookie('XSRF-TOKEN')
      if (!token) {
        await ensureCsrfPrimed()
        await new Promise((r) => setTimeout(r, 0)) // let browser apply Set-Cookie
        token = getCookie('XSRF-TOKEN')
      }
      if (token) {
        config.headers = config.headers || {}
        config.headers['X-XSRF-TOKEN'] = token
      }
    }

    // Отправляем смещение времени (для тестирования) в каждом запросе
    const offsetMs = getOffsetMs()
    if (offsetMs !== 0) {
      config.headers = config.headers || {}
      config.headers['X-Time-Offset-Ms'] = String(offsetMs)
    }

    // Skip refresh-waiting logic for auth endpoints to avoid deadlocks
    if (isAuthEndpoint) {
      return config
    }

    // Proactively refresh if access_token is likely expired (prevents 401 round-trip)
    if (!isRefreshing && isTokenLikelyExpired()) {
      if (DEBUG_AUTH) console.log('[Request Interceptor] Token likely expired, proactive refresh before:', config.url)
      try {
        isRefreshing = true
        refreshPromise = client.post('/auth/refresh')
        await refreshPromise
        markRefreshSuccess()
      } catch (e: any) {
        if (DEBUG_AUTH) console.warn('[Request Interceptor] Proactive refresh failed:', e?.response?.status)
      } finally {
        isRefreshing = false
        refreshPromise = null
      }
    }
    
    // Если уже идет refresh, ждем его завершения перед отправкой запроса
    if (isRefreshing && refreshPromise) {
      if (DEBUG_AUTH) console.log('[Request Interceptor] Refresh in progress, waiting:', config.url)
      try {
        await refreshPromise
        if (DEBUG_AUTH) console.log('[Request Interceptor] Refresh completed, proceeding:', config.url)
      } catch (error) {
        console.error('[Request Interceptor] Refresh failed while waiting:', error)
        // Если refresh не удался с 401, не отправляем запрос - он все равно упадет
        // Если другая ошибка, отправляем запрос - он может получить 401, который обработает response interceptor
        const refreshError = error as any
        if (refreshError?.response?.status === 401) {
          console.log('[Request Interceptor] Refresh failed with 401, request will be rejected')
          throw error // Пробрасываем ошибку, чтобы запрос не отправился
        }
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Interceptor для обработки ошибок и автоматического refresh
client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any
    const requestUrl: string = (originalRequest?.url || '').toString()
    const isAuthEndpoint =
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/login/') ||
      requestUrl.includes('/auth/logout')

    // Обработка 401 - попытка refresh token
    // Важно: НЕ пытаемся refresh'ить, если сам refresh/login/logout упал с 401 — иначе получаем бесконечный цикл
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (DEBUG_AUTH) console.log('[Interceptor] 401 for:', originalRequest?.url, 'isRefreshing:', isRefreshing)
      
      if (!originalRequest) {
        if (DEBUG_AUTH) console.error('[Interceptor] No request config for 401')
        return Promise.reject(error)
      }
      
      if (isRefreshing && refreshPromise) {
        if (DEBUG_AUTH) console.log('[Interceptor] Queuing (refresh in progress):', originalRequest.url)
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject, config: originalRequest })
        })
      }

      // Если еще не идет refresh, начинаем его
      if (!isRefreshing) {
        if (DEBUG_AUTH) console.log('[Interceptor] Starting refresh for:', originalRequest.url)
        originalRequest._retry = true
        isRefreshing = true

        refreshPromise = client
          .post('/auth/refresh')
          .then(() => {
            if (DEBUG_AUTH) console.log('[Interceptor] Refresh OK, retrying:', originalRequest.url)
            markRefreshSuccess()
            isRefreshing = false
            refreshPromise = null
            processQueue(null)
            originalRequest._retry = false
            return client(originalRequest)
          })
          .catch((refreshError: any) => {
            console.warn('[Interceptor] Token refresh failed:', refreshError?.response?.status ?? refreshError?.message)
            isRefreshing = false
            refreshPromise = null
            processQueue(refreshError) // Обрабатываем очередь с ошибкой
            
            // Останавливаем таймер refresh, если он запущен
            stopTokenRefreshTimer()
            
            // ВАЖНО: редиректим на логин ТОЛЬКО если refresh вернул 401 (реально неавторизован).
            // Любые временные ошибки (500/Network) не должны "выбрасывать" пользователя.
            if (refreshError?.response?.status === 401) {
              redirectToLogin()
            }
            throw refreshError
          })
        
        return refreshPromise
      }

      if (DEBUG_AUTH) console.error('[Interceptor] Unexpected: isRefreshing but no promise')
      return Promise.reject(new Error('Unexpected state: refresh should be in progress'))
    }

    // 403: retry once after priming CSRF (fixes "first click fails" when cookie wasn't set yet)
    if (error.response?.status === 403 && originalRequest && !originalRequest._csrfRetry) {
      const method = (originalRequest?.method || 'get').toUpperCase()
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        originalRequest._csrfRetry = true
        await ensureCsrfPrimed()
        // Give the browser a moment to apply Set-Cookie, then set header so retry definitely sends it
        await new Promise((r) => setTimeout(r, 0))
        const token = getCookie('XSRF-TOKEN')
        if (token) {
          originalRequest.headers = originalRequest.headers || {}
          originalRequest.headers['X-XSRF-TOKEN'] = token
        }
        return client(originalRequest)
      }
    }

    return Promise.reject(error)
  }
)

export default client
