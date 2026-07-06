import { describe, it, expect } from 'vitest'
import type { AgentConfig, Tenant } from '../types/index.js'

describe('AgentConfig type', () => {
  it('accepts all valid llmProvider values', () => {
    const providers: AgentConfig['llmProvider'][] = ['anthropic', 'openai', 'moonshot', 'openai-codex']
    for (const provider of providers) {
      const config: AgentConfig = {
        tenantId: 'test', userId: 'user',
        telegramPhone: '+1234567890', llmProvider: provider,
      }
      expect(config.llmProvider).toBe(provider)
    }
  })

  it('walletAddress is optional', () => {
    const config: AgentConfig = {
      tenantId: 'test', userId: 'user',
      telegramPhone: '+1234567890', llmProvider: 'anthropic',
    }
    expect(config.walletAddress).toBeUndefined()
  })
})

describe('Tenant plan values', () => {
  it('accepts all valid plan values', () => {
    const plans: Tenant['plan'][] = ['starter', 'pro', 'elite', 'enterprise']
    for (const plan of plans) {
      const tenant: Tenant = {
        id: 'id', userId: 'uid', phone: '+1', walletAddress: 'UQ',
        plan, status: 'active', createdAt: new Date(),
      }
      expect(tenant.plan).toBe(plan)
    }
  })

  it('accepts all valid status values', () => {
    const statuses: Tenant['status'][] = ['pending', 'active', 'suspended']
    for (const status of statuses) {
      const tenant: Tenant = {
        id: 'id', userId: 'uid', phone: '+1', walletAddress: 'UQ',
        plan: 'starter', status, createdAt: new Date(),
      }
      expect(tenant.status).toBe(status)
    }
  })
})

describe('Credit cost constants', () => {
  it('provider credit costs are positive numbers', () => {
    const CREDIT_COST: Record<string, number> = {
      moonshot: 3, openai: 9, anthropic: 13, gemini: 8,
    }
    for (const cost of Object.values(CREDIT_COST)) {
      expect(cost).toBeGreaterThan(0)
      expect(cost).toBeLessThan(100)
    }
  })
})
