/**
 * Utility functions for sessionStorage caching
 */

const CACHE_DURATION = 2 * 60 * 1000 // 2 minutes

export function getCache<T>(key: string): T | null {
  try {
    const cached = sessionStorage.getItem(key)
    const timestamp = sessionStorage.getItem(`${key}_timestamp`)
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp, 10)
      if (age < CACHE_DURATION) {
        return JSON.parse(cached) as T
      }
    }
  } catch (e) {
    console.warn(`[Cache] Failed to read cache for ${key}:`, e)
  }
  return null
}

export function setCache<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(data))
    sessionStorage.setItem(`${key}_timestamp`, Date.now().toString())
  } catch (e) {
    console.warn(`[Cache] Failed to write cache for ${key}:`, e)
  }
}

export function clearCache(key: string): void {
  try {
    sessionStorage.removeItem(key)
    sessionStorage.removeItem(`${key}_timestamp`)
  } catch (e) {
    console.warn(`[Cache] Failed to clear cache for ${key}:`, e)
  }
}




