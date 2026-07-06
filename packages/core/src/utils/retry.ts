export interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffFactor?: number
  shouldRetry?: (err: unknown) => boolean
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 500,
    maxDelayMs = 10000,
    backoffFactor = 2,
    shouldRetry = () => true,
  } = options

  let lastError: unknown
  let delay = initialDelayMs

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === maxAttempts || !shouldRetry(err)) throw err
      console.warn(`[Retry] Attempt ${attempt}/${maxAttempts} failed: ${String(err)} — retrying in ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
      delay = Math.min(delay * backoffFactor, maxDelayMs)
    }
  }

  throw lastError
}

export function isNetworkError(err: unknown): boolean {
  const msg = String(err).toLowerCase()
  return msg.includes('fetch') || msg.includes('network') ||
    msg.includes('timeout') || msg.includes('econnreset') ||
    msg.includes('econnrefused') || msg.includes('429')
}
