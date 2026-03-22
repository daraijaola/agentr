import { useState, useEffect } from 'react'
import { TonConnectUIProvider, TonConnectButton, useTonConnectUI, useTonAddress, useTonWallet } from '@tonconnect/ui-react'
import { WorkspaceTab } from './components/WorkspaceTab'
import { MarketplaceTab } from './components/MarketplaceTab'
import { CreditsTab } from './components/CreditsTab'
import { BotsTab } from './components/BotsTab'
import { ActivityTab } from './components/ActivityTab'
import { post, apiGet, detectApiBase, type Screen, type LiveTab, type AgentState } from './lib/api'
import './styles/app.css'

const AGENTR_WALLET = 'UQAKcLE05XnFDeVVDxRHnBNzxFHsYNojckqJCdCsL32qmy2M'

const SIDEBAR_ITEMS: [LiveTab, string, boolean][] = [
  ['overview', 'Overview', true],
  ['marketplace', 'Marketplace', true],
  ['workspace', 'Workspace', true],
  ['activity', 'Activity', true],
  ['bots', 'Bots', true],
  ['credits', 'Credits', true],
  ['miniapps', 'Mini Apps', false],
  ['tonsites', 'TON Sites', false],
  ['subagents', 'Sub-agents', false],
]

const PROVISIONING_STEPS = [
  'Setting up your TON wallet',
  'Connecting to Telegram',
  'Loading your agent',
  'Preparing workspace',
  'Ready',
]

function AppInner({ tonConnectUI, tonAddress, tonWallet }: { tonConnectUI: any; tonAddress: string; tonWallet: any }) {
  const [screen, setScreen] = useState<Screen>('landing')
  const [agent, setAgent] = useState<AgentState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [twofa, setTwofa] = useState('')
  const [provStep, setProvStep] = useState(0)
  const [copied, setCopied] = useState(false)
  const [setupData, setSetupData] = useState({ agentName: '', ownerName: '', ownerUsername: '', dmPolicy: 'contacts' })
  const [liveTab, setLiveTab] = useState<LiveTab>('overview')
  const [provider, setProvider] = useState('claude')
  const [switchingProvider, setSwitchingProvider] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const API = detectApiBase()

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem('agentr_tenant')
    if (saved) {
      try {
        const a = JSON.parse(saved)
        setAgent(a)
        setProvider(a.provider ?? 'claude')
        setScreen('live')
        apiGet('/agent/status/' + a.tenantId).then((d) => {
          if (d.status === 'online' && d.telegram) {
            const updated = { ...a, username: d.telegram.username, firstName: d.telegram.firstName }
            setAgent(updated)
            localStorage.setItem('agentr_tenant', JSON.stringify(updated))
          }
        }).catch(() => {})
      } catch {
        localStorage.removeItem('agentr_tenant')
      }
    }
  }, [])

  // Provisioning animation
  useEffect(() => {
    if (screen !== 'provisioning') return
    let i = 0
    const t = setInterval(() => { i++; setProvStep(i); if (i >= 4) clearInterval(t) }, 1000)
    return () => clearInterval(t)
  }, [screen])

  // Load credits when live
  useEffect(() => {
    if (screen !== 'live' || !agent) return
    apiGet('/agent/credits/' + agent.tenantId)
      .then((d) => { if (typeof d.credits === 'number') setCredits(d.credits) })
      .catch(() => {})
  }, [screen, agent])

  const goLive = async (tenantId: string) => {
    setScreen('provisioning')
    for (let a = 0; a < 20; a++) {
      await new Promise((r) => setTimeout(r, 1500))
      try {
        const data = await apiGet(`/agent/status/${tenantId}`)
        if (data.status === 'online') {
          const saved: AgentState = {
            tenantId, phone: agent?.phone ?? phone,
            username: data.telegram?.username,
            firstName: data.telegram?.firstName,
            walletAddress: data.walletAddress,
            phoneCodeHash: '',
          }
          setAgent(saved)
          localStorage.setItem('agentr_tenant', JSON.stringify(saved))
          setScreen('live')
          return
        }
      } catch {}
    }
    setScreen('live')
  }

  const handlePhone = async () => {
    setLoading(true); setError('')
    try {
      const blocked = await post('/agent/check-phone', { phone: phone.trim() })
      if (blocked.blocked) throw new Error('This account has used its free trial. Please upgrade to continue.')
      const d = await post('/auth/request-otp', { phone: phone.trim() })
      if (!d.success) throw new Error(d.error)
      setAgent({ tenantId: d.tenantId, phoneCodeHash: d.phoneCodeHash, phone: d.phone, isNew: !d.existing })
      setScreen('otp')
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  const handleOtp = async () => {
    if (!agent) return
    setLoading(true); setError('')
    try {
      const d = await post('/auth/verify-otp', {
        tenantId: agent.tenantId, phone: agent.phone,
        phoneCodeHash: agent.phoneCodeHash, code: otp.trim(),
      })
      if (d.error === '2FA_REQUIRED') { setScreen('twofa'); return }
      if (!d.success) throw new Error(d.error)
      if (!agent.isNew) { await goLive(agent.tenantId) } else { setScreen('setup') }
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  const handle2FA = async () => {
    if (!agent) return
    setLoading(true); setError('')
    try {
      const d = await post('/auth/verify-2fa', { tenantId: agent.tenantId, phone: agent.phone, password: twofa.trim() })
      if (!d.success) throw new Error(d.error)
      if (!agent.isNew) { await goLive(agent.tenantId) } else { setScreen('setup') }
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  const handleSubscribe = async (priceUsd: number) => {
    if (!tonWallet) { tonConnectUI.openModal(); return }
    const TON_PRICE_USD = 5.2
    const nanoton = Math.ceil((priceUsd / TON_PRICE_USD) * 1_000_000_000)
    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: AGENTR_WALLET, amount: String(nanoton) }],
      })
      alert('Payment sent! Your plan will activate within a few minutes.')
    } catch (e: any) {
      if (String(e).includes('reject') || String(e).includes('cancel')) return
      alert('Transaction failed. Please try again.')
    }
  }

  const handlePlan = async (planId: string) => {
    if (!agent || planId !== 'free') return
    try {
      const existingCheck = await fetch(API + '/agent/workspace/' + agent.tenantId + '/SOUL.md').then((r) => r.json()).catch(() => ({ content: '' }))
      const isFirstTime = !existingCheck.content || existingCheck.content.length < 100
      if (isFirstTime && (setupData.agentName || setupData.ownerName || setupData.dmPolicy !== 'contacts')) {
        const userContent = `# User\n\nOwner name: ${setupData.ownerName || 'Not set'}\nAgent name: ${setupData.agentName || 'Not set'}\nDM policy: ${setupData.dmPolicy}\n\nThis file is updated automatically as the agent learns more about the owner.`
        await fetch(API + '/agent/workspace/' + agent.tenantId + '/USER.md', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: userContent }),
        }).catch(() => {})
        if (setupData.agentName) {
          const soulRes = await fetch(API + '/agent/workspace/' + agent.tenantId + '/SOUL.md').then((r) => r.json()).catch(() => ({ content: '' }))
          const addition = `\n\nYour name is ${setupData.agentName}. When introducing yourself, use this name.`
          if (setupData.ownerName) {
            await fetch(API + '/agent/workspace/' + agent.tenantId + '/SOUL.md', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: (soulRes.content || '') + addition }),
            }).catch(() => {})
          }
        }
      }
      await post('/agent/start-trial', { tenantId: agent.tenantId })
      await post('/agent/provision', { tenantId: agent.tenantId, phone: agent.phone })
    } catch {}
    await goLive(agent.tenantId)
  }

  const switchProvider = async (p: string) => {
    if (!agent || p === provider) return
    setSwitchingProvider(true)
    try {
      const d = await post('/agent/provider', { tenantId: agent.tenantId, provider: p })
      if (d.success) {
        setProvider(p)
        const updated = { ...agent, provider: p }
        setAgent(updated); localStorage.setItem('agentr_tenant', JSON.stringify(updated))
      }
    } catch {} finally { setSwitchingProvider(false) }
  }

  const copyWallet = () => {
    if (agent?.walletAddress) {
      navigator.clipboard.writeText(agent.walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const disconnect = () => {
    const saved = localStorage.getItem('agentr_tenant')
    if (saved) {
      try {
        const a = JSON.parse(saved)
        localStorage.setItem('agentr_tenantId', a.tenantId ?? '')
        localStorage.setItem('agentr_phone', a.phone ?? '')
      } catch {}
    }
    localStorage.removeItem('agentr_tenant')
    setAgent(null); setScreen('landing')
  }

  const tryRestoreSession = async () => {
    const saved = localStorage.getItem('agentr_tenant')
    if (saved) {
      try {
        const a = JSON.parse(saved)
        const d = await apiGet('/agent/status/' + a.tenantId)
        if (d.status === 'online') { setAgent(a); setProvider(a.provider ?? 'claude'); setScreen('live'); return }
      } catch {}
    }
    setScreen('phone')
  }

  const PLANS = [
    { id: 'free', name: 'Free Trial', price: 'Free', period: '1 day', highlight: false, cta: 'Start free', note: 'Powered by Claude. No credit card.', features: ['24hr access', 'Claude AI (limited)', 'TON wallet included'] },
    { id: 'starter', name: 'Starter', price: '$15', period: 'mo', highlight: false, cta: 'Subscribe', note: '', features: ['7,500 credits/mo', 'All models', 'Bots & mini apps', 'TON payments', 'Cocoon hosting'] },
    { id: 'pro', name: 'Pro', price: '$29', period: 'mo', highlight: true, cta: 'Subscribe', note: '', features: ['20,000 credits/mo', 'All models', 'Sub-agents (soon)', 'TON Sites & DNS', 'Marketplace'] },
    { id: 'elite', name: 'Elite', price: '$49', period: 'mo', highlight: false, cta: 'Subscribe', note: '', features: ['40,000 credits/mo', 'All models priority', 'Swarm mode', 'Publish agents & earn 75%', 'Dedicated support'] },
  ]

  const PROVIDERS = [
    { id: 'claude', name: 'Claude', sub: 'Exceptional reasoning', img: '/claude.webp', available: true },
    { id: 'openai', name: 'ChatGPT', sub: 'GPT-4o, full API', img: '/openai.webp', available: false },
    { id: 'kimi', name: 'Kimi', sub: 'Fast and capable', img: '/kimi.webp', available: false },
    { id: 'gemini', name: 'Gemini', sub: 'Multimodal intelligence', img: '/gemini.webp', available: false },
  ]

  return (
    <>
      {/* Mobile nav */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-nav-overlay" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-nav-menu">
            <button className="mobile-nav-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
            <button className="nav-link" style={{ fontSize: 16, padding: '12px 0' }} onClick={() => { setMobileMenuOpen(false); tryRestoreSession() }}>Sign in</button>
            <button className="btn btn-blue" style={{ justifyContent: 'center' }} onClick={() => { setMobileMenuOpen(false); setScreen('phone') }}>Get started</button>
          </div>
        </>
      )}

      {/* ── LANDING ── */}
      {screen === 'landing' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', animation: 'fadeup 0.5s ease' }}>
          <nav className="nav">
            <div className="logo">AGENT<em>R</em></div>
            <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)}>☰</button>
            <div className="nav-r">
              <button className="nav-link" onClick={tryRestoreSession}>Sign in</button>
              <TonConnectButton />
              <button className="btn btn-dark" onClick={() => setScreen('phone')}>Get started</button>
            </div>
          </nav>
          <div className="hero">
            <div className="hero-left">
              <div className="hero-tag"><div className="tag-dot" />AI Agent Factory on TON</div>
              <h1 className="hero-h1">Build your entire<br />TON ecosystem,<br /><em>through conversation.</em></h1>
              <p className="hero-p">One master AI agent that lives on your Telegram account. It builds bots, deploys code, manages your TON wallet, and interacts with the blockchain — all through plain conversation.</p>
              <div className="hero-actions">
                <button className="btn btn-dark" onClick={() => setScreen('phone')}>Launch your agent</button>
                <button className="btn btn-outline" onClick={tryRestoreSession}>Sign in</button>
                <a href="https://github.com/daraijaola/agentr" target="_blank" rel="noreferrer" className="btn btn-outline" style={{ textDecoration: 'none' }}>
                  <img src="/github.png" alt="GitHub" style={{ width: 15, height: 15, objectFit: 'contain' }} /> GitHub
                </a>
              </div>
            </div>
            <div className="hero-right">
              <div className="hero-right-title">What your agent can build</div>
              {[
                { title: 'Telegram Bots', desc: 'Full bots with commands, inline keyboards, and logic — deployed in seconds.' },
                { title: 'Mini Apps', desc: 'Web apps that live inside Telegram, built and launched autonomously.' },
                { title: 'TON Websites', desc: 'Decentralized sites on TON Storage, accessible via TON DNS.' },
                { title: 'Sub-agents', desc: 'Specialized agents spawned for specific tasks, working under your master agent.' },
                { title: 'Payment Flows', desc: 'TON payment gates, transaction monitoring, and wallet operations.' },
                { title: 'TON DNS Domains', desc: 'Register and manage .ton domains directly from conversation.' },
              ].map((c) => (
                <div className="cap-item" key={c.title}>
                  <div className="cap-dot" />
                  <div className="cap-text">
                    <div className="cap-title">{c.title}</div>
                    <div className="cap-desc">{c.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="ai-section">
            <div className="ai-label">Powered by leading AI</div>
            <div className="ai-logos">
              {[{ src: '/claude.webp', name: 'Claude' }, { src: '/openai.webp', name: 'OpenAI' }, { src: '/gemini.webp', name: 'Gemini' }, { src: '/kimi.webp', name: 'Kimi' }].map((ai) => (
                <div className="ai-logo-item" key={ai.name}>
                  <div className="ai-logo-box"><img src={ai.src} alt={ai.name} /></div>
                  <span className="ai-logo-name">{ai.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="how-section">
            <div className="how-inner">
              {[
                { num: '01', title: 'Connect your Telegram', desc: 'Sign in with your phone number. Your master agent activates on your Telegram account and starts listening immediately.' },
                { num: '02', title: 'Describe what you want', desc: 'Tell your agent what to build in plain English. A payment bot. A mini app. A TON website. Anything.' },
                { num: '03', title: 'Your ecosystem builds itself', desc: 'The agent writes code, deploys it, manages processes, handles TON payments, and reports back — all without you touching a terminal.' },
              ].map((step) => (
                <div className="how-col" key={step.num}>
                  <div className="how-num">{step.num}</div>
                  <div className="how-title">{step.title}</div>
                  <div className="how-desc">{step.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="footer">
            <span>AGENTR — AI Agent Factory on TON</span>
            <span>TON · Telegram</span>
          </div>
        </div>
      )}

      {/* ── PHONE ── */}
      {screen === 'phone' && (
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-logo">AGENT<em>R</em></div>
            <button className="back-btn" onClick={() => { setScreen('landing'); setError('') }}>← Back</button>
            <div className="auth-title">Connect Telegram</div>
            <div className="auth-sub">Enter your phone number to activate your personal agent.</div>
            <div className="field">
              <label className="field-lbl">Phone number</label>
              <input className="field-inp" type="tel" placeholder="+1 234 567 8900" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePhone()} autoFocus />
            </div>
            <button className="btn btn-dark btn-full" onClick={handlePhone} disabled={loading || !phone.trim()}>{loading ? 'Sending…' : 'Send code'}</button>
            {error && <div className="err">{error}</div>}
            <p className="hint">We'll send a verification code to your Telegram app.</p>
          </div>
        </div>
      )}

      {/* ── OTP ── */}
      {screen === 'otp' && (
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-logo">AGENT<em>R</em></div>
            <button className="back-btn" onClick={() => { setScreen('phone'); setError('') }}>← Back</button>
            <div className="auth-title">Check Telegram</div>
            <div className="auth-sub">Enter the code sent to {agent?.phone}.</div>
            <div className="field">
              <label className="field-lbl">Verification code</label>
              <input className="field-inp" type="text" placeholder="12345" maxLength={5} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && handleOtp()} autoFocus />
            </div>
            <button className="btn btn-dark btn-full" onClick={handleOtp} disabled={loading || otp.length !== 5}>{loading ? 'Verifying…' : 'Confirm'}</button>
            {error && <div className="err">{error}</div>}
          </div>
        </div>
      )}

      {/* ── 2FA ── */}
      {screen === 'twofa' && (
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-logo">AGENT<em>R</em></div>
            <div className="auth-title">Two-step verification</div>
            <div className="auth-sub">Enter your Telegram cloud password to continue.</div>
            <div className="field">
              <label className="field-lbl">Password</label>
              <input className="field-inp" type="password" placeholder="Your password" value={twofa} onChange={(e) => setTwofa(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handle2FA()} autoFocus />
            </div>
            <button className="btn btn-dark btn-full" onClick={handle2FA} disabled={loading || !twofa.trim()}>{loading ? 'Checking…' : 'Continue'}</button>
            {error && <div className="err">{error}</div>}
          </div>
        </div>
      )}

      {/* ── SETUP ── */}
      {screen === 'setup' && (
        <div className="auth-page">
          <div className="auth-card" style={{ maxWidth: 460 }}>
            <div className="auth-logo">AGENT<em>R</em></div>
            <div className="auth-title">Set up your agent</div>
            <div className="field">
              <div className="field-lbl">What should your agent call you?</div>
              <input className="field-inp" placeholder="e.g. Mike, Boss, Alex" maxLength={32} value={setupData.ownerName} onChange={(e) => setSetupData((p) => ({ ...p, ownerName: e.target.value }))} />
            </div>
            <div className="field">
              <div className="field-lbl">Give your agent a name <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></div>
              <input className="field-inp" placeholder="e.g. Nova, Rex, Axiom" maxLength={32} value={setupData.agentName} onChange={(e) => setSetupData((p) => ({ ...p, agentName: e.target.value }))} />
            </div>
            <div className="field">
              <div className="field-lbl">Who can trigger your agent?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[{ id: 'everyone', label: 'Everyone', desc: 'Any incoming DM triggers the agent' }, { id: 'contacts', label: 'Contacts only', desc: 'Only people saved in your contacts' }, { id: 'manual', label: 'Manual only', desc: 'Only activates when you message it yourself' }].map((opt) => (
                  <div key={opt.id} onClick={() => setSetupData((p) => ({ ...p, dmPolicy: opt.id }))}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 8, border: `1px solid ${setupData.dmPolicy === opt.id ? 'var(--blue)' : 'var(--border)'}`, background: setupData.dmPolicy === opt.id ? 'var(--blue-bg)' : 'var(--surface)', cursor: 'pointer' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${setupData.dmPolicy === opt.id ? 'var(--blue)' : 'var(--border2)'}`, background: setupData.dmPolicy === opt.id ? 'var(--blue)' : 'transparent', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{opt.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button className="btn btn-dark btn-full" style={{ marginTop: 8 }} onClick={async () => {
              if (agent) { try { await post('/agent/setup', { tenantId: agent.tenantId, ...setupData }) } catch {} }
              setScreen('pricing')
            }}>Continue</button>
          </div>
        </div>
      )}

      {/* ── PRICING ── */}
      {screen === 'pricing' && (
        <div className="pricing-page">
          <div className="pricing-inner">
            <div style={{ marginBottom: 24 }}><button className="back-btn" onClick={() => setScreen('otp')}>← Back</button></div>
            <div className="pricing-head">
              <div className="pricing-title">Choose your plan</div>
              <div className="pricing-sub">Start free for 24 hours, upgrade when ready.</div>
            </div>
            <div className="plans-grid">
              {PLANS.map((plan) => (
                <div key={plan.id} className={`plan-card${plan.highlight ? ' highlight' : ''}`}>
                  {plan.highlight && <div className="plan-badge">Popular</div>}
                  <div className="plan-name">{plan.name}</div>
                  <div className="plan-price">{plan.price}</div>
                  <div className="plan-period">/ {plan.period}</div>
                  {plan.note && <div className="plan-note">{plan.note}</div>}
                  <div className="plan-features">
                    {plan.features.map((f) => <div key={f} className="plan-feat"><span className="plan-check">✓</span>{f}</div>)}
                  </div>
                  <button
                    style={{ width: '100%', padding: '11px 22px', borderRadius: 8, border: 'none', background: plan.id === 'free' ? '#141413' : 'var(--blue)', color: '#fff', fontFamily: 'var(--f)', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 20 }}
                    onClick={() => { if (plan.id === 'free') handlePlan(plan.id); else if (plan.id === 'starter') handleSubscribe(15); else if (plan.id === 'pro') handleSubscribe(29); else handleSubscribe(49) }}>
                    {plan.id === 'free' ? plan.cta : (tonWallet ? 'Pay with TON' : 'Subscribe')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PROVISIONING ── */}
      {screen === 'provisioning' && (
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-logo">AGENT<em>R</em></div>
            <div className="auth-title">Setting things up</div>
            <div className="auth-sub">Give us a moment — we're getting your agent ready.</div>
            <div className="prov-list">
              {PROVISIONING_STEPS.map((s, i) => (
                <div key={i} className={`prov-row ${i < provStep ? 'done' : i === provStep ? 'active' : ''}`}>
                  <span className="prov-ic">{i < provStep ? '✓' : '·'}</span>{s}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LIVE DASHBOARD ── */}
      {screen === 'live' && agent && (
        <div className="live">
          <div className="live-topbar">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button className="sidebar-toggle hamburger" onClick={() => setSidebarOpen((s) => !s)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '8px', color: 'var(--text)', marginRight: 8 }}>☰</button>
              <div className="logo">AGENT<em>R</em></div>
            </div>
            <div className="live-topbar-r">
              <div className="status-badge"><div className="status-dot" />Active</div>
              {credits !== null && (
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: 100 }}>
                  {credits.toLocaleString()} credits
                </div>
              )}
              <div style={{ transform: 'scale(0.85)', transformOrigin: 'right center' }}><TonConnectButton /></div>
              {agent.username && <a className="tg-btn" href={`https://t.me/${agent.username}`} target="_blank" rel="noreferrer">Open in Telegram</a>}
              <button className="disc-btn" onClick={disconnect}>Disconnect</button>
            </div>
          </div>

          {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

          <div className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
            {SIDEBAR_ITEMS.map(([id, label, avail]) => (
              <div key={id} className={`sb-item${liveTab === id ? ' active' : ''}${!avail ? ' locked' : ''}`} onClick={() => { avail && setLiveTab(id); setSidebarOpen(false) }}>
                <span>{label}</span>
                {!avail && <span className="sb-soon">Soon</span>}
              </div>
            ))}
          </div>

          <div className="main">
            {liveTab === 'overview' && (
              <div className="main-body">
                <div>
                  <div className="live-greeting">{agent.firstName ? `Hey, ${agent.firstName}.` : 'Your agent is live.'}</div>
                  <div className="live-tagline">{agent.username ? `@${agent.username} is online and ready.` : `${agent.phone} is active.`}</div>
                </div>
                {agent.walletAddress && (
                  <div className="info-card">
                    <div className="info-label">TON Wallet</div>
                    <div className="wallet-row">
                      <div className="wallet-addr">{agent.walletAddress}</div>
                      <button className={`copy-btn${copied ? ' ok' : ''}`} onClick={copyWallet}>{copied ? 'Copied' : 'Copy'}</button>
                    </div>
                  </div>
                )}
                <div className="info-card">
                  <div className="info-label" style={{ marginBottom: 14 }}>AI Model</div>
                  <div className="provider-grid">
                    {PROVIDERS.map((p) => (
                      <div key={p.id} className={`prov-card${provider === p.id ? ' active' : ''}${!p.available ? ' locked' : ''}`} onClick={() => p.available && !switchingProvider && switchProvider(p.id)}>
                        <div className="prov-img"><img src={p.img} alt={p.name} /></div>
                        <div><div className="prov-name">{p.name}</div><div className="prov-sub">{p.sub}</div></div>
                        {provider === p.id && p.available && <div className="prov-dot" />}
                        {!p.available && <span className="prov-soon">Soon</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {liveTab === 'workspace' && <WorkspaceTab tenantId={agent.tenantId} apiBase={detectApiBase()} />}
            {liveTab === 'marketplace' && <MarketplaceTab tenantId={agent.tenantId} />}
            {liveTab === 'credits' && <CreditsTab tenantId={agent.tenantId} tonWallet={tonWallet} tonConnectUI={tonConnectUI} />}
            {liveTab === 'bots' && <BotsTab tenantId={agent.tenantId} />}
            {liveTab === 'activity' && <ActivityTab tenantId={agent.tenantId} />}
          </div>
        </div>
      )}
    </>
  )
}

function AppInnerWithWallet() {
  const [tonConnectUI] = useTonConnectUI()
  const tonAddress = useTonAddress()
  const tonWallet = useTonWallet()
  return <AppInner tonConnectUI={tonConnectUI} tonAddress={tonAddress} tonWallet={tonWallet} />
}

export default function App() {
  return (
    <TonConnectUIProvider manifestUrl={`${detectApiBase().replace(':3001', ':5173')}/tonconnect-manifest.json`}>
      <AppInnerWithWallet />
    </TonConnectUIProvider>
  )
}
