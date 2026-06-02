/**
 * Retry an API call with exponential backoff on rate limit (429) errors
 * Optimized for faster failure - reduced default retries and delays
 */
export async function retryOnRateLimit<T>(
  apiCall: () => Promise<T>,
  maxRetries = 1, // Reduced from 2 to 1 for faster failure
  baseDelay = 200 // Reduced to 200ms for faster retries
): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall()
    } catch (error: any) {
      lastError = error
      const status = error?.response?.status

      // Only retry on 429 (rate limit)
      if (status === 429 && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) // Exponential backoff: 200ms, 400ms
        console.log(`[API Retry] Rate limited, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      // For other errors or max retries reached, throw
      throw error
    }
  }

  throw lastError
}

/** Short pause between sequential API calls (bulk export/import) to avoid 429 bursts. */
export function apiPaceMs(ms = 75): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Bulk flows: more retries + longer base delay after 429 (backend standard bucket ~200/min). */
export function retryOnRateLimitBulk<T>(apiCall: () => Promise<T>): Promise<T> {
  return retryOnRateLimit(apiCall, 10, 450)
}

