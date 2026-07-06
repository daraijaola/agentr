export async function fetchJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

export async function fetchWithRetry<T = unknown>(url: string, options?: RequestInit, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fetchJson<T>(url, options) } catch (e) {
      if (i === retries - 1) throw e
      await new Promise(r => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw new Error("fetchWithRetry exhausted")
}

export async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}
