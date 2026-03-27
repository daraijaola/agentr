import React from 'react'
import { detectApiBase, getAuthHeader } from '../lib/api'

const CATS = ['All', 'TON/DeFi', 'Commerce', 'Productivity', 'Utility']
const DEV_CATS = ['TON/DeFi', 'Commerce', 'Productivity', 'Utility', 'Entertainment', 'Education', 'Other']

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border2)',
  borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--f)',
  fontSize: 14, padding: '10px 14px', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 4, display: 'block',
}
const btnBlack: React.CSSProperties = {
  fontFamily: 'var(--f)', fontSize: 14, fontWeight: 500, padding: '11px',
  borderRadius: 8, border: 'none', background: '#141413', color: '#ffffff',
  cursor: 'pointer', width: '100%',
}
const cardStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
  padding: '28px', display: 'flex', flexDirection: 'column', gap: 14,
}

interface Props {
  tenantId: string
}

type View = 'browse' | 'dev-login' | 'dev-register' | 'dev-dashboard' | 'dev-submit'

export function MarketplaceTab({ tenantId }: Props) {
  const [agents, setAgents] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState('All')
  const [deploying, setDeploying] = React.useState<string | null>(null)
  const [deployed, setDeployed] = React.useState<string | null>(null)
  const [view, setView] = React.useState<View>('browse')
  const [devToken, setDevToken] = React.useState(() => localStorage.getItem('agentr_dev_token') ?? '')
  const [devData, setDevData] = React.useState<any>(null)
  const [loginForm, setLoginForm] = React.useState({ email: '', password: '' })
  const [regForm, setRegForm] = React.useState({ name: '', email: '', password: '', telegram: '', wallet: '', category: '', bio: '' })
  const [submitForm, setSubmitForm] = React.useState({ name: '', description: '', category: '', github: '', test_account: '', notes: '' })
  const [formError, setFormError] = React.useState('')
  const [formLoading, setFormLoading] = React.useState(false)
  const API = detectApiBase()

  React.useEffect(() => {
    fetch(API + '/agent/marketplace?t=' + Date.now())
      .then((r) => r.json())
      .then((d) => { if (d.agents) setAgents(d.agents) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (!devToken) return
    fetch(API + '/agent/dev/profile/' + devToken)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) { setDevData(d); setView('dev-dashboard') }
        else { localStorage.removeItem('agentr_dev_token'); setDevToken('') }
      })
      .catch(() => {})
  }, [devToken])

  const deploy = async (agentId: string) => {
    setDeploying(agentId)
    try {
      const res = await fetch(API + '/agent/marketplace/deploy', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ tenantId, agentId }),
      })
      const d = await res.json()
      if (d.success) { setDeployed(agentId); setTimeout(() => setDeployed(null), 3000) }
    } catch {} finally { setDeploying(null) }
  }

  const handleLogin = async () => {
    setFormLoading(true); setFormError('')
    try {
      const res = await fetch(API + '/agent/dev/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      })
      const d = await res.json()
      if (!d.success) { setFormError(d.error); return }
      localStorage.setItem('agentr_dev_token', d.token)
      setDevToken(d.token)
      const p = await fetch(API + '/agent/dev/profile/' + d.token).then((r) => r.json())
      if (p.success) { setDevData(p); setView('dev-dashboard') }
    } catch { setFormError('Something went wrong') } finally { setFormLoading(false) }
  }

  const handleRegister = async () => {
    setFormLoading(true); setFormError('')
    if (!regForm.category) { setFormError('Please select a category'); setFormLoading(false); return }
    try {
      const res = await fetch(API + '/agent/dev/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm),
      })
      const d = await res.json()
      if (!d.success) { setFormError(d.error); return }
      localStorage.setItem('agentr_dev_token', d.token)
      setDevToken(d.token)
      const p = await fetch(API + '/agent/dev/profile/' + d.token).then((r) => r.json())
      if (p.success) { setDevData(p); setView('dev-dashboard') }
    } catch { setFormError('Something went wrong') } finally { setFormLoading(false) }
  }

  const handleSubmitAgent = async () => {
    setFormLoading(true); setFormError('')
    try {
      const res = await fetch(API + '/agent/dev/submit-agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...submitForm, token: devToken }),
      })
      const d = await res.json()
      if (!d.success) { setFormError(d.error); return }
      setView('dev-dashboard')
      const p = await fetch(API + '/agent/dev/profile/' + devToken).then((r) => r.json())
      if (p.success) setDevData(p)
    } catch { setFormError('Something went wrong') } finally { setFormLoading(false) }
  }

  const handleWithdraw = async () => {
    try {
      const res = await fetch(API + '/agent/dev/withdraw', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: devToken }),
      })
      const d = await res.json()
      if (d.success) alert('Withdrawal request submitted! ' + d.amount + ' credits → ' + d.wallet)
      else alert(d.error)
    } catch {}
  }

  if (view === 'dev-login') return (
    <div style={{ padding: '32px', maxWidth: 440, margin: '0 auto', minHeight: '100vh' }}>
      <button onClick={() => setView('browse')} style={{ fontFamily: 'var(--f)', fontSize: 13, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, padding: 0 }}>← Back</button>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, marginBottom: 4 }}>Developer login</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 28 }}>Sign in to your developer account.</div>
      <div style={cardStyle}>
        <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" placeholder="you@example.com" value={loginForm.email} onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))} /></div>
        <div><label style={labelStyle}>Password</label><input style={inputStyle} type="password" placeholder="••••••••" value={loginForm.password} onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))} /></div>
        {formError && <div style={{ fontSize: 13, color: 'var(--err)', background: 'var(--err-bg)', padding: '10px 14px', borderRadius: 8 }}>{formError}</div>}
        <button style={btnBlack} onClick={handleLogin} disabled={formLoading}>{formLoading ? 'Signing in...' : 'Sign in'}</button>
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
          No account?{' '}
          <button onClick={() => setView('dev-register')} style={{ fontFamily: 'var(--f)', fontSize: 13, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Register</button>
        </div>
      </div>
    </div>
  )

  if (view === 'dev-register') return (
    <div style={{ padding: '32px', maxWidth: 480, margin: '0 auto', minHeight: '100vh' }}>
      <button onClick={() => setView('dev-login')} style={{ fontFamily: 'var(--f)', fontSize: 13, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, padding: 0 }}>← Back</button>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, marginBottom: 4 }}>Create dev account</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 28 }}>Build agents, publish them, earn 75% of every credit spent on your work.</div>
      <div style={cardStyle}>
        {[
          { key: 'name', label: 'Full name', placeholder: 'Your name', type: 'text' },
          { key: 'email', label: 'Email', placeholder: 'you@example.com', type: 'email' },
          { key: 'password', label: 'Password', placeholder: 'At least 6 characters', type: 'password' },
          { key: 'telegram', label: 'Telegram username', placeholder: '@yourhandle', type: 'text' },
          { key: 'wallet', label: 'TON wallet (for earnings)', placeholder: 'UQ...', type: 'text' },
        ].map((f) => (
          <div key={f.key}><label style={labelStyle}>{f.label}</label><input style={inputStyle} type={f.type} placeholder={f.placeholder} value={(regForm as any)[f.key]} onChange={(e) => setRegForm((p) => ({ ...p, [f.key]: e.target.value }))} /></div>
        ))}
        <div>
          <label style={labelStyle}>Your specialty</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {DEV_CATS.map((c) => (
              <button key={c} onClick={() => setRegForm((p) => ({ ...p, category: c }))}
                style={{ fontFamily: 'var(--f)', fontSize: 12, padding: '6px 14px', borderRadius: 100, border: '1px solid var(--border)', cursor: 'pointer', background: regForm.category === c ? '#141413' : '#F4F3EE', color: regForm.category === c ? '#ffffff' : '#1A1916' }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div><label style={labelStyle}>Bio (optional)</label><textarea style={{ ...inputStyle, height: 80, resize: 'none' }} placeholder="Tell us what you build..." value={regForm.bio} onChange={(e) => setRegForm((p) => ({ ...p, bio: e.target.value }))} /></div>
        {formError && <div style={{ fontSize: 13, color: 'var(--err)', background: 'var(--err-bg)', padding: '10px 14px', borderRadius: 8 }}>{formError}</div>}
        <button style={btnBlack} onClick={handleRegister} disabled={formLoading}>{formLoading ? 'Creating account...' : 'Create account'}</button>
      </div>
    </div>
  )

  if (view === 'dev-dashboard' && devData) {
    const dev = devData.dev
    const devAgents = devData.agents ?? []
    const canWithdraw = dev.earnings_credits >= 1000
    return (
      <div style={{ padding: '32px', maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 400 }}>Dev Dashboard</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Hey {dev.name} · {dev.category}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => setView('dev-submit')} style={{ fontFamily: 'var(--f)', fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff', cursor: 'pointer' }}>Submit agent</button>
            <button onClick={() => { localStorage.removeItem('agentr_dev_token'); setDevToken(''); setDevData(null); setView('browse') }} style={{ fontFamily: 'var(--f)', fontSize: 13, color: 'var(--text3)', background: 'none', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>
        <div style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text3)', marginBottom: 6 }}>Total earnings</div>
            <div style={{ fontSize: 36, fontWeight: 600, color: 'var(--blue)', letterSpacing: '-.5px' }}>{dev.earnings_credits.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>credits · ${(dev.earnings_credits * 0.001).toFixed(2)} USD equiv.</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button onClick={handleWithdraw} disabled={!canWithdraw}
              style={{ fontFamily: 'var(--f)', fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, border: 'none', background: canWithdraw ? 'var(--dark)' : 'var(--bg2)', color: canWithdraw ? '#fff' : 'var(--text3)', cursor: canWithdraw ? 'pointer' : 'not-allowed' }}>
              Withdraw to TON
            </button>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Min. 1,000 credits</div>
          </div>
        </div>
        {!dev.approved && (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#92400e' }}>
            Your account is pending review. Agents you submit will appear in the marketplace once approved (usually within 48 hours).
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text3)', marginBottom: 12 }}>Your agents ({devAgents.length})</div>
          {devAgents.length === 0 ? (
            <div style={{ ...cardStyle, alignItems: 'center', textAlign: 'center', padding: '48px', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>No agents yet</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>Submit your first agent to start earning.</div>
              <button onClick={() => setView('dev-submit')} style={{ fontFamily: 'var(--f)', fontSize: 14, fontWeight: 500, padding: '8px 20px', borderRadius: 8, border: 'none', background: '#0098EA', color: '#fff', cursor: 'pointer', marginTop: 8 }}>Submit your first agent</button>
            </div>
          ) : devAgents.map((a: any) => (
            <div key={a.id} style={{ ...cardStyle, flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {a.category}{a.installs > 0 ? ` · ${a.installs} installs` : ''}{a.rating > 0 ? ` · ${a.rating.toFixed(1)} ★` : ''}
                </div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, background: a.active ? 'var(--ok-bg)' : 'var(--bg2)', color: a.active ? 'var(--ok)' : 'var(--text3)', border: `1px solid ${a.active ? 'var(--ok-bdr)' : 'var(--border)'}` }}>
                {a.active ? 'Live' : 'Under review'}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (view === 'dev-submit') return (
    <div style={{ padding: '32px', maxWidth: 560 }}>
      <button onClick={() => setView('dev-dashboard')} style={{ fontFamily: 'var(--f)', fontSize: 13, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, padding: 0 }}>← Back</button>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 400, marginBottom: 4 }}>Submit an agent</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 28 }}>Fill in your agent details. The AGENTR team reviews within 48 hours.</div>
      <div style={cardStyle}>
        {[
          { key: 'name', label: 'Agent name', placeholder: 'e.g. TON Price Tracker' },
          { key: 'description', label: 'Description', placeholder: 'What does this agent do? Be specific.' },
        ].map((f) => (
          <div key={f.key}><label style={labelStyle}>{f.label}</label><input style={inputStyle} placeholder={f.placeholder} value={(submitForm as any)[f.key]} onChange={(e) => setSubmitForm((p) => ({ ...p, [f.key]: e.target.value }))} /></div>
        ))}
        <div>
          <label style={labelStyle}>Category</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {DEV_CATS.filter((c) => c !== 'Other').map((c) => (
              <button key={c} onClick={() => setSubmitForm((p) => ({ ...p, category: c }))}
                style={{ fontFamily: 'var(--f)', fontSize: 12, padding: '6px 14px', borderRadius: 100, border: '1px solid var(--border)', cursor: 'pointer', background: submitForm.category === c ? '#141413' : '#F4F3EE', color: submitForm.category === c ? '#ffffff' : '#1A1916' }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div><label style={labelStyle}>GitHub repository URL</label><input style={inputStyle} placeholder="https://github.com/yourname/your-agent" value={submitForm.github} onChange={(e) => setSubmitForm((p) => ({ ...p, github: e.target.value }))} /></div>
        <div><label style={labelStyle}>Test Telegram account</label><input style={inputStyle} placeholder="@username" value={submitForm.test_account} onChange={(e) => setSubmitForm((p) => ({ ...p, test_account: e.target.value }))} /></div>
        <div><label style={labelStyle}>Additional notes (optional)</label><textarea style={{ ...inputStyle, height: 80, resize: 'none' }} placeholder="Anything else we should know..." value={submitForm.notes} onChange={(e) => setSubmitForm((p) => ({ ...p, notes: e.target.value }))} /></div>
        {formError && <div style={{ fontSize: 13, color: 'var(--err)', background: 'var(--err-bg)', padding: '10px 14px', borderRadius: 8 }}>{formError}</div>}
        <button style={btnBlack} onClick={handleSubmitAgent} disabled={formLoading}>{formLoading ? 'Submitting...' : 'Submit for review'}</button>
      </div>
    </div>
  )

  // Browse
  const filtered = filter === 'All' ? agents : agents.filter((a) => a.category === filter)
  return (
    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 400, marginBottom: 4 }}>Marketplace</div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>Deploy community-built agents to your account in one click.</div>
        </div>
        <button onClick={() => devToken ? setView('dev-dashboard') : setView('dev-login')}
          style={{ fontFamily: 'var(--f)', fontSize: 13, fontWeight: 500, color: 'var(--blue)', background: 'var(--blue-bg)', border: '1px solid var(--blue)', padding: '8px 18px', borderRadius: 8, cursor: 'pointer' }}>
          {devToken ? 'Dev Dashboard' : 'I am a developer →'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {CATS.map((c) => (
          <button key={c} onClick={() => setFilter(c)}
            style={{ fontFamily: 'var(--f)', fontSize: 13, padding: '6px 16px', borderRadius: 100, border: filter === c ? '1px solid #141413' : '1px solid #D4D0C8', cursor: 'pointer', background: filter === c ? '#141413' : '#fff', color: filter === c ? '#fff' : '#6B6760', fontWeight: filter === c ? 500 : 400, transition: 'all .15s' }}>
            {c}
          </button>
        ))}
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading agents...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text2)', fontSize: 14 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, marginBottom: 8 }}>No agents yet</div>
          <div>Be the first to publish an agent in this category.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
          {filtered.map((a) => (
            <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</span>
                    {a.verified && <span style={{ fontSize: 10, background: 'var(--blue-bg)', color: 'var(--blue)', padding: '1px 7px', borderRadius: 100, fontWeight: 500 }}>Official</span>}
                  </div>
                  <span style={{ fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)', padding: '2px 8px', borderRadius: 100 }}>{a.category}</span>
                </div>
                {a.installs > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'right', flexShrink: 0 }}>
                    {a.rating > 0 && <div>{a.rating.toFixed(1)} ★</div>}
                    <div>{a.installs.toLocaleString()} installs</div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, flex: 1 }}>{a.description}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>by {a.creator_name ?? 'Community'}</span>
                <button onClick={() => deploy(a.id)} disabled={deploying === a.id}
                  style={{ fontFamily: 'var(--f)', fontSize: 12, fontWeight: 500, padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', background: deployed === a.id ? 'var(--ok)' : 'var(--blue)', color: '#fff', opacity: deploying === a.id ? 0.6 : 1 }}>
                  {deployed === a.id ? 'Deployed!' : deploying === a.id ? 'Deploying...' : 'Deploy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
