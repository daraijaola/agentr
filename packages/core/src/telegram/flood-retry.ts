// Adapted from Teleton (MIT)
export async function withFloodRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const e = err as Record<string, unknown>
      if (e['errorMessage'] === 'FLOOD_WAIT' && typeof e['seconds'] === 'number') {
        if (attempt < maxRetries) {
          const wait = (e['seconds'] as number) * 1000
          console.warn(`[FloodRetry] Flood wait ${e['seconds']}s  retrying in ${wait}ms`)
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
      }
      throw err
    }
  }
  throw new Error('withFloodRetry: max retries exceeded')
}
