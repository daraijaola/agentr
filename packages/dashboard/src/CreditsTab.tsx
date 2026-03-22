import React from 'react'
import { detectApiBase } from '../lib/api'

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
}

interface Props {
  tenantId: string
  tonWallet: any
  tonConnectUI: any
}

export function CreditsTab({ tenantId, tonWallet, tonConnectUI }: Props) {
  const [data, setData] = React.useState<CreditsData>({
    credits: 0,
    totalUsed: 0,
    totalAdded: 0,
    transactions: [],
  })
  const [loading, setLoading] = React.useState(true)
  const API = detectApiBase()

  React.useEffect(() => {
    fetch(API + '/agent/credits-usage/' + tenantId)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tenantId])

  const planLimit = 100000
  const pct = Math.min(100, Math.round((data.credits / planLimit) * 100))

  const CREDIT_PACKS = [
    { usd: 5, credits: 5500, ton: '3.8' },
    { usd: 10, credits: 12000, ton: '7.5' },
    { usd: 25, credits: 32000, ton: '18.8' },
  ]

  const CREDIT_COSTS = [
    { action: 'Message (Kimi)', cost: '3 credits', note: '~$0.003' },
    { action: 'Message (GPT-4o)', cost: '9 credits', note: '~$0.009' },
    { action: 'Message (Claude)', cost: '13 credits', note: '~$0.013' },
    { action: 'Message (Gemini)', cost: '8 credits', note: '~$0.008' },
    { action: 'Tool call', cost: '1 credit', note: 'free tier' },
    { action: 'Bot deployment', cost: '10 credits', note: 'one-time' },
    { action: 'Codex (free tier)', cost: '0 credits', note: 'no charge' },
  ]

  const handleTopUp = async (pack: (typeof CREDIT_PACKS)[0]) => {
    if (!tonWallet) {
      tonConnectUI.openModal()
      return
    }
    const nanoton = Math.ceil(parseFloat(pack.ton) * 1_000_000_000)
    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: 'UQAKcLE05XnFDeVVDxRHnBNzxFHsYNojckqJCdCsL32qmy2M',
            amount: String(nanoton),
          },
        ],
      })
      alert(
        'Payment sent! ' + pack.credits.toLocaleString() + ' credits will be added within a few minutes.'
      )
    } catch (e: any) {
      if (String(e).includes('reject') || String(e).includes('cancel')) return
      tonConnectUI.openModal()
    }
  }

  return (
    <div style={{ padding: '32px', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 400, letterSpacing: '-.3px' }}>
        Credits
      </div>

      {/* Balance card */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 0,
        }}
      >
        {[
          { label: 'Balance', value: data.credits.toLocaleString(), sub: 'credits remaining', color: 'var(--blue)' },
          { label: 'Used this month', value: data.totalUsed.toLocaleString(), sub: 'credits consumed', color: 'var(--text)' },
          { label: 'Added total', value: data.totalAdded.toLocaleString(), sub: 'credits received', color: 'var(--ok)' },
        ].map((item, i) => (
          <div
            key={item.label}
            style={{
              padding: '0 20px',
              borderRight: i < 2 ? '1px solid var(--border)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text3)' }}>
              {item.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, color: item.color, letterSpacing: '-.5px' }}>
              {item.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Credit balance</span>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>{pct}% remaining</span>
        </div>
        <div style={{ background: 'var(--bg2)', borderRadius: 100, height: 8, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              borderRadius: 100,
              background: pct > 20 ? 'var(--blue)' : 'var(--err)',
              width: pct + '%',
              transition: 'width .4s',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>0</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{planLimit.toLocaleString()} total</span>
        </div>
      </div>

      {/* Credit costs */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text3)', marginBottom: 14 }}>
          Credit costs
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {CREDIT_COSTS.map((item, i) => (
            <div
              key={item.action}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: i < CREDIT_COSTS.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{item.action}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{item.note}</span>
              </div>
              <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 500 }}>{item.cost}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top up */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Top up credits</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          Pay with TON. Credits are added instantly after payment confirms.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
          {CREDIT_PACKS.map((pack) => (
            <button
              key={pack.usd}
              onClick={() => handleTopUp(pack)}
              style={{
                fontFamily: 'var(--f)',
                padding: '14px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'border-color .15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--blue)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--blue)', marginBottom: 2 }}>
                ${pack.usd}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{pack.credits.toLocaleString()} credits</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{pack.ton} TON</div>
            </button>
          ))}
        </div>
        {!tonWallet && (
          <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
            Connect your TON wallet in the top bar to pay
          </div>
        )}
      </div>

      {/* Transaction history */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text3)', marginBottom: 12 }}>
          Transaction history
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading...</div>
        ) : data.transactions.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text2)', padding: '24px 0' }}>
            No transactions yet. Credits will be deducted as you use your agent.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.transactions.map((tx, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{tx.description || tx.type}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {tx.model ? tx.model + ' · ' : ''}
                    {new Date(tx.created_at).toLocaleString()}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: tx.amount > 0 ? 'var(--ok)' : 'var(--err)',
                  }}
                >
                  {tx.amount > 0 ? '+' : ''}
                  {tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
