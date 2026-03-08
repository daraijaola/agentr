export const GECKOTERMINAL_API_URL = 'https://api.geckoterminal.com/api/v2'
export const STONFI_API_BASE_URL = 'https://api.ston.fi'

export async function tonapiFetch(path: string, options?: RequestInit): Promise<Response> {
  const base = 'https://tonapi.io/v2'
  const apiKey = process.env['TONAPI_KEY'] ?? ''
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
}
