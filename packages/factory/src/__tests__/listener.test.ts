import { describe, expect, it } from 'vitest'
import { formatSenderIdentity, groupMessageAddressesAgent } from '../listener.js'

describe('groupMessageAddressesAgent', () => {
  const me = { username: 'TheAgent_R1', id: 123n }

  it('allows explicit username mentions in groups', () => {
    expect(groupMessageAddressesAgent('yo @TheAgent_R1 check this', me)).toBe(true)
    expect(groupMessageAddressesAgent('@theagent_r1 what is your TON balance?', me)).toBe(true)
  })

  it('allows Telegram mention metadata and replies to the agent', () => {
    expect(groupMessageAddressesAgent('check this', me, { mentioned: true })).toBe(true)
    expect(groupMessageAddressesAgent('replying to you', me, undefined, true)).toBe(true)
  })

  it('allows natural agent prompts in groups', () => {
    expect(groupMessageAddressesAgent('Zion, create a group with me', me)).toBe(true)
    expect(groupMessageAddressesAgent('agentr check this wallet', me)).toBe(true)
    expect(groupMessageAddressesAgent('the agent: list your files', me)).toBe(true)
  })

  it('ignores ordinary group chatter and partial username matches', () => {
    expect(groupMessageAddressesAgent('random group chat', me)).toBe(false)
    expect(groupMessageAddressesAgent('hello @TheAgent_R10', me)).toBe(false)
    expect(groupMessageAddressesAgent('this marginal css thing', me)).toBe(false)
  })
})

describe('formatSenderIdentity', () => {
  it('includes display name, username, and Telegram ID when available', () => {
    expect(formatSenderIdentity(
      { firstName: 'Micheal', lastName: 'Ijaola', username: 'micheal_ijaola' },
      '777001'
    )).toBe('Micheal Ijaola (@micheal_ijaola, Telegram ID: 777001)')
  })

  it('falls back to ID when sender fields are missing', () => {
    expect(formatSenderIdentity({}, '777001')).toBe('Telegram ID: 777001')
  })
})
