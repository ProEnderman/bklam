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

/** Удаляет все ключи sessionStorage, начинающиеся с prefix (включая *_timestamp). */
export function clearCacheByPrefix(prefix: string): void {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k != null && k.startsWith(prefix)) {
        toRemove.push(k)
      }
    }
    for (const k of toRemove) {
      sessionStorage.removeItem(k)
    }
  } catch (e) {
    console.warn(`[Cache] Failed to clear cache by prefix ${prefix}:`, e)
  }
}




