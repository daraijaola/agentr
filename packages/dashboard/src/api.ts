declare const __API_URL__: string

export function detectApiBase(): string {
  if (typeof __API_URL__ !== 'undefined' && __API_URL__) return __API_URL__
  if (typeof window === 'undefined') return ''
  const { protocol, hostname, port } = window.location
  if (port === '5173') return `${protocol}//${hostname}:3001`
  return ''
}

export const API = detectApiBase()

export async function post(path: string, body: object) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function apiGet(path: string) {
  const res = await fetch(API + path)
  return res.json()
}

export type Screen = 'landing' | 'phone' | 'otp' | 'twofa' | 'provisioning' | 'live' | 'pricing' | 'setup'
export type LiveTab = 'overview' | 'workspace' | 'bots' | 'activity' | 'credits' | 'miniapps' | 'tonsites' | 'subagents' | 'marketplace'

export interface AgentState {
  tenantId: string
  phoneCodeHash: string
  phone: string
  username?: string
  firstName?: string
  walletAddress?: string
  provider?: string
  isNew?: boolean
}
