import React from 'react'
import { detectApiBase, getAuthHeader } from '../lib/api'

const AGENTR_WALLET = 'UQAKcLE05XnFDeVVDxRHnBNzxFHsYNojckqJCdCsL32qmy2M'

interface Transaction {
  amount: number
  type: string
  description: string
  model: string
  created_at: string
}

interface CreditsData {
  credits: number
  totalUsed: number
  totalAdded: number
  transactions: Transaction[]
  plan?: string
  planName?: string
  planModel?: string
  planLimit?: number
}

interface Props {
  tenantId: string
  tonWallet: any
  tonConnectUI: any
}

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  free:       { bg: '#F3F4F6', color: '#374151' },
  starter:    { bg: '#EFF6FF', color: '#1D4ED8' },
  pro:        { bg: '#F5F3FF', color: '#7C3AED' },
  ultra:      { bg: '#F5F3FF', color: '#7C3AED' },
  elite:      { bg: '#FFFBEB', color: '#B45309' },
  enterprise: { bg: '#ECFDF5', color: '#065F46' },
}

const CREDIT_PACKS = [
  { usd: 5,  credits: 5500,  ton: '3.8',  label: '$5' },
  { usd: 10, credits: 12000, ton: '7.5',  label: '$10', popular: true },
  { usd: 25, credits: 32000, ton: '18.8', label: '$25' },
]

const MODEL_COSTS: { action: string; cost: string; note: string }[] = [
  { action: 'Chat — BTL-2',              cost: '~1 cr/1k tokens', note: 'BTL Runtime blended route' },
  { action: 'Chat — DeepSeek V4 Flash',  cost: '~1 cr/1k tokens', note: '$0.00009 in / $0.00018 out per 1k' },
  { action: 'Chat — DeepSeek V4 Pro',    cost: '~2 cr/1k tokens', note: '$0.000435 in / $0.00087 out per 1k' },
  { action: 'Chat — DeepSeek R1 0528',   cost: '~4 cr/1k tokens', note: '$0.0005 in / $0.00215 out per 1k' },
]

export function CreditsTab({ tenantId, tonWallet, tonConnectUI }: Props) {
  const [data, setData] = React.useState<CreditsData>({
    credits: 0, totalUsed: 0, totalAdded: 0, transactions: [],
  })
  const [statusData, setStatusData] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  const API = detectApiBase()

  React.useEffect(() => {
    Promise.all([
      fetch(API + '/agent/credits-usage/' + tenantId, { headers: getAuthHeader() }).then(r => r.json()),
      fetch(API + '/agent/status/' + tenantId, { headers: getAuthHeader() }).then(r => r.json()),
    ]).then(([usage, status]) => {
      setData(usage)
      setStatusData(status)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [tenantId])

  const plan = statusData?.plan ?? 'free'
  const planName = statusData?.planName ?? (plan.charAt(0).toUpperCase() + plan.slice(1))
  const planModel = statusData?.planModel ?? 'BTL-2'
  const planLimit = statusData?.planLimit ?? 1000
  const credits = data.credits
  const pct = Math.min(100, Math.round((credits / planLimit) * 100))
  const planColor = PLAN_COLORS[plan] ?? PLAN_COLORS.free

  const handleTopUp = async (pack: typeof CREDIT_PACKS[0]) => {
    if (!tonWallet) { tonConnectUI.openModal(); return }
    const nanoton = Math.ceil(parseFloat(pack.ton) * 1_000_000_000)
    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: AGENTR_WALLET, amount: String(nanoton) }],
      })
      alert(`Payment sent! ${pack.credits.toLocaleString()} credits will be added within a few minutes.`)
    } catch (e: any) {
      if (String(e).includes('reject') || String(e).includes('cancel')) return
      tonConnectUI.openModal()
    }
  }

  if (loading) return (
    <div style={{ padding: 32, color: 'var(--text3)', fontSize: 14 }}>Loading credits…</div>
  )

  return (
    <div style={{ padding: '24px 28px', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 400, letterSpacing: '-.3px' }}>
        Credits & Plan
      </div>

      {/* ── Plan + balance hero card ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Current Plan</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ background: planColor.bg, color: planColor.color, padding: '4px 14px', borderRadius: 100, fontSize: 14, fontWeight: 700, letterSpacing: '.2px' }}>
                {planName}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{planModel}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>Balance</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px', color: credits <= 20 ? 'var(--err)' : 'var(--blue)' }}>
              {credits.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>credits remaining</div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
            <span>{credits.toLocaleString()} remaining</span>
            <span>{planLimit.toLocaleString()} total</span>
          </div>
          <div style={{ height: 8, background: 'var(--bg2)', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: pct < 20 ? 'var(--err)' : pct < 50 ? 'var(--warn)' : 'var(--blue)',
              borderRadius: 100,
              transition: 'width 0.5s ease',
            }} />
          </div>
          {credits <= 20 && (
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--err)', fontWeight: 500 }}>
              ⚠️ Almost out! Top up now to avoid Limited Mode.
            </div>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {[
            { label: 'Used this month', value: data.totalUsed.toLocaleString(), color: 'var(--text)' },
            { label: 'All-time added', value: data.totalAdded.toLocaleString(), color: 'var(--ok)' },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text3)', marginBottom: 4 }}>{stat.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px', color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Top-up packs ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Top up with TON</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {CREDIT_PACKS.map(pack => (
            <button
              key={pack.usd}
              onClick={() => handleTopUp(pack)}
              style={{
                position: 'relative',
                background: pack.popular ? 'var(--blue)' : 'var(--bg)',
                color: pack.popular ? '#fff' : 'var(--text)',
                border: pack.popular ? 'none' : '1px solid var(--border)',
                borderRadius: 12,
                padding: '14px 16px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontFamily: 'var(--f)',
              }}
            >
              {pack.popular && (
                <span style={{ position: 'absolute', top: -8, right: 10, background: '#F59E0B', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100 }}>BEST VALUE</span>
              )}
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px' }}>{pack.credits.toLocaleString()}</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>credits</span>
              <span style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{pack.label} · {pack.ton} TON</span>
            </button>
          ))}
        </div>
        {!tonWallet && (
          <div style={{ fontSize: 13, color: 'var(--text2)', padding: '10px 14px', background: 'var(--bg2)', borderRadius: 8 }}>
            Connect your TON wallet above to pay with TON.
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text2)', padding: '10px 14px', background: 'var(--bg2)', borderRadius: 8, wordBreak: 'break-all' }}>
          Payments go to AGENTR billing wallet: {statusData?.billingWallet ?? AGENTR_WALLET}
        </div>
      </div>

      {/* ── Model cost reference ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Credit costs by model</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {MODEL_COSTS.map((row, i) => (
            <div key={row.action} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0',
              borderBottom: i < MODEL_COSTS.length - 1 ? '1px solid var(--border)' : 'none',
              gap: 12,
            }}>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{row.action}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>{row.cost}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{row.note}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Transaction history ── */}
      {data.transactions.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Recent transactions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {data.transactions.slice(0, 20).map((tx, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '9px 0',
                borderBottom: i < Math.min(data.transactions.length, 20) - 1 ? '1px solid var(--border)' : 'none',
                gap: 12,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.description || 'LLM call'}
                  </span>
                  {tx.model && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{tx.model}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: tx.amount < 0 ? 'var(--err)' : 'var(--ok)' }}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {new Date(tx.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
