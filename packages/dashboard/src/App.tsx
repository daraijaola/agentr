import { useState, useRef, useEffect } from 'react'

type Screen = 'phone' | 'otp' | 'twofa' | 'provisioning' | 'chat'

interface AgentState {
  tenantId: string
  phoneCodeHash: string
  phone: string
  status: 'online' | 'offline'
  username?: string
  firstName?: string
  walletAddress?: string
  tools?: number
}

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
  toolCalls?: Array<{ name: string }>
  ts: number
}

const API = ''

async function post(path: string, body: object) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('phone')
  const [agent, setAgent] = useState<AgentState | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [twofa, setTwofa] = useState('')
  const [provisioningStep, setProvisioningStep] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (screen === 'provisioning') {
      const steps = [
        'Generating TON wallet...',
        'Spinning up agent container...',
        'Loading tools...',
        'Connecting to Telegram...',
        'Agent is live!',
      ]
      let i = 0
      const t = setInterval(() => {
        i++
        setProvisioningStep(i)
        if (i >= steps.length - 1) clearInterval(t)
      }, 800)
      return () => clearInterval(t)
    }
  }, [screen])

  const handlePhone = async () => {
    if (!phone.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await post('/auth/request-otp', { phone: phone.trim() })
      if (!data.success) throw new Error(data.error)
      setAgent({ tenantId: data.tenantId, phoneCodeHash: data.phoneCodeHash, phone: data.phone, status: 'offline' })
      setScreen('otp')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleOtp = async () => {
    if (!otp.trim() || !agent) return
    setLoading(true)
    setError('')
    try {
      const data = await post('/auth/verify-otp', {
        tenantId: agent.tenantId,
        phone: agent.phone,
        phoneCodeHash: agent.phoneCodeHash,
        code: otp.trim(),
      })
      if (data.error === '2FA_REQUIRED') {
        setScreen('twofa')
        return
      }
      if (!data.success) throw new Error(data.error)
      setScreen('provisioning')
      setTimeout(() => pollStatus(agent.tenantId), 4000)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handle2FA = async () => {
    if (!twofa.trim() || !agent) return
    setLoading(true)
    setError('')
    try {
      const data = await post('/auth/verify-2fa', {
        tenantId: agent.tenantId,
        phone: agent.phone,
        password: twofa.trim(),
      })
      if (!data.success) throw new Error(data.error)
      setScreen('provisioning')
      setTimeout(() => pollStatus(agent.tenantId), 4000)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const pollStatus = async (tenantId: string) => {
    try {
      const res = await fetch(`/agent/status/${tenantId}`)
      const data = await res.json()
      if (data.status === 'online') {
        setAgent((prev) => prev ? {
          ...prev,
          status: 'online',
          username: data.telegram?.username,
          firstName: data.telegram?.firstName,
          tools: data.tools,
        } : prev)
        setScreen('chat')
        setMessages([{
          role: 'agent',
          content: `Hey${data.telegram?.firstName ? ` ${data.telegram.firstName}` : ''}! I'm your AGENTR agent. I'm live on your Telegram account with ${data.tools ?? 0} tools loaded. What do you want to build?`,
          ts: Date.now(),
        }])
      } else {
        setTimeout(() => pollStatus(tenantId), 2000)
      }
    } catch {
      setTimeout(() => pollStatus(tenantId), 3000)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !agent || loading) return
    const msg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: msg, ts: Date.now() }])
    setLoading(true)
    try {
      const data = await post('/agent/message', {
        tenantId: agent.tenantId,
        message: msg,
      })
      setMessages((prev) => [...prev, {
        role: 'agent',
        content: data.reply ?? data.error ?? 'No response',
        toolCalls: data.toolCalls,
        ts: Date.now(),
      }])
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'agent', content: `Error: ${String(e)}`, ts: Date.now() }])
    } finally {
      setLoading(false)
    }
  }

  const provSteps = ['Generating TON wallet...', 'Spinning up container...', 'Loading tools...', 'Connecting to Telegram...', 'Agent is live!']

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #080808;
          --surface: #0f0f0f;
          --surface2: #141414;
          --border: #1c1c1c;
          --accent: #0EA5E9;
          --accent2: #38bdf8;
          --white: #efefef;
          --mid: #666;
          --dim: #333;
          --success: #4ade80;
          --error: #f87171;
          --font-display: 'Syne', sans-serif;
          --font-mono: 'Space Mono', monospace;
        }
        html, body, #root {
          height: 100%;
          background: var(--bg);
          color: var(--white);
          font-family: var(--font-mono);
        }
        .app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .app::before {
          content: '';
          position: fixed;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(ellipse at 60% 20%, rgba(14,165,233,0.04) 0%, transparent 60%),
                      radial-gradient(ellipse at 20% 80%, rgba(56,189,248,0.03) 0%, transparent 50%);
          pointer-events: none;
        }
        .card {
          width: 100%;
          max-width: 440px;
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 40px;
          position: relative;
          z-index: 1;
        }
        .card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--accent), transparent);
        }
        .logo {
          font-family: var(--font-display);
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--white);
          margin-bottom: 4px;
        }
        .logo span { color: var(--accent); }
        .subtitle {
          font-size: 11px;
          color: var(--mid);
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 36px;
        }
        .label {
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--mid);
          margin-bottom: 8px;
        }
        input {
          width: 100%;
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--white);
          font-family: var(--font-mono);
          font-size: 14px;
          padding: 12px 16px;
          outline: none;
          transition: border-color 0.2s;
          margin-bottom: 16px;
        }
        input:focus { border-color: var(--accent); }
        input::placeholder { color: var(--dim); }
        button {
          width: 100%;
          background: var(--accent);
          color: #000;
          border: none;
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          padding: 13px;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
        }
        button:hover { opacity: 0.9; }
        button:active { transform: scale(0.99); }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        .error {
          font-size: 11px;
          color: var(--error);
          margin-top: 12px;
          padding: 10px 12px;
          background: rgba(248,113,113,0.06);
          border-left: 2px solid var(--error);
        }
        .hint {
          font-size: 11px;
          color: var(--mid);
          margin-top: 12px;
          line-height: 1.6;
        }
        /* Provisioning */
        .prov-steps { margin: 24px 0; }
        .prov-step {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          font-size: 12px;
          color: var(--dim);
          border-bottom: 1px solid var(--border);
          transition: color 0.3s;
        }
        .prov-step.done { color: var(--success); }
        .prov-step.active { color: var(--accent); }
        .prov-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--dim);
          flex-shrink: 0;
          transition: background 0.3s;
        }
        .prov-step.done .prov-dot { background: var(--success); }
        .prov-step.active .prov-dot {
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        /* Chat */
        .chat-wrap {
          width: 100%;
          max-width: 680px;
          height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 1;
        }
        .chat-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--surface);
        }
        .chat-header-left { display: flex; align-items: center; gap: 12px; }
        .status-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--success);
          box-shadow: 0 0 8px var(--success);
          animation: pulse 2s infinite;
        }
        .agent-name {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 15px;
        }
        .agent-sub { font-size: 10px; color: var(--mid); letter-spacing: 1px; margin-top: 2px; }
        .tools-badge {
          font-size: 10px;
          color: var(--accent);
          border: 1px solid var(--accent);
          padding: 3px 8px;
          letter-spacing: 1px;
        }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .msg {
          max-width: 80%;
          padding: 12px 16px;
          font-size: 13px;
          line-height: 1.6;
          position: relative;
        }
        .msg.user {
          align-self: flex-end;
          background: var(--accent);
          color: #000;
          font-family: var(--font-mono);
        }
        .msg.agent {
          align-self: flex-start;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-left: 2px solid var(--accent);
        }
        .msg-tools {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255,255,255,0.08);
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .tool-tag {
          font-size: 9px;
          letter-spacing: 1px;
          color: var(--accent2);
          border: 1px solid rgba(56,189,248,0.2);
          padding: 2px 6px;
          text-transform: uppercase;
        }
        .typing {
          align-self: flex-start;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-left: 2px solid var(--accent);
          padding: 14px 18px;
        }
        .typing-dots { display: flex; gap: 4px; }
        .typing-dots span {
          width: 5px; height: 5px;
          background: var(--accent);
          border-radius: 50%;
          animation: bounce 1.2s infinite;
        }
        .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        .chat-input-area {
          padding: 16px 24px;
          border-top: 1px solid var(--border);
          background: var(--surface);
          display: flex;
          gap: 12px;
        }
        .chat-input-area input {
          flex: 1;
          margin: 0;
          font-size: 13px;
        }
        .chat-input-area button {
          width: auto;
          padding: 12px 20px;
          font-size: 11px;
          white-space: nowrap;
        }
        .back-btn {
          background: transparent;
          color: var(--mid);
          border: 1px solid var(--border);
          font-size: 10px;
          padding: 8px 14px;
          width: auto;
          margin-bottom: 20px;
          letter-spacing: 1px;
        }
        .back-btn:hover { color: var(--white); border-color: var(--white); opacity: 1; }
      `}</style>

      {/* PHONE SCREEN */}
      {screen === 'phone' && (
        <div className="app">
          <div className="card">
            <div className="logo">AGENT<span>R</span></div>
            <div className="subtitle">AI Agent Factory  TON & Telegram</div>
            <div className="label">Your phone number</div>
            <input
              type="tel"
              placeholder="+1 234 567 8900"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePhone()}
              autoFocus
            />
            <button onClick={handlePhone} disabled={loading || !phone.trim()}>
              {loading ? 'Sending code...' : 'Get Code '}
            </button>
            {error && <div className="error">{error}</div>}
            <div className="hint">
              Enter your Telegram phone number. We'll send a verification code to your Telegram app.
            </div>
          </div>
        </div>
      )}

      {/* OTP SCREEN */}
      {screen === 'otp' && (
        <div className="app">
          <div className="card">
            <button className="back-btn" onClick={() => { setScreen('phone'); setError('') }}> Back</button>
            <div className="logo">AGENT<span>R</span></div>
            <div className="subtitle">Check your Telegram app</div>
            <div className="label">Verification code</div>
            <input
              type="text"
              placeholder="12345"
              maxLength={5}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleOtp()}
              autoFocus
            />
            <button onClick={handleOtp} disabled={loading || otp.length !== 5}>
              {loading ? 'Verifying...' : 'Verify & Launch Agent '}
            </button>
            {error && <div className="error">{error}</div>}
            <div className="hint">
              Code sent to {agent?.phone}. Check your Telegram app for the 5-digit code.
            </div>
          </div>
        </div>
      )}

      {/* 2FA SCREEN */}
      {screen === 'twofa' && (
        <div className="app">
          <div className="card">
            <div className="logo">AGENT<span>R</span></div>
            <div className="subtitle">2FA Required</div>
            <div className="label">Cloud password</div>
            <input
              type="password"
              placeholder="Your Telegram 2FA password"
              value={twofa}
              onChange={(e) => setTwofa(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handle2FA()}
              autoFocus
            />
            <button onClick={handle2FA} disabled={loading || !twofa.trim()}>
              {loading ? 'Verifying...' : 'Confirm '}
            </button>
            {error && <div className="error">{error}</div>}
          </div>
        </div>
      )}

      {/* PROVISIONING SCREEN */}
      {screen === 'provisioning' && (
        <div className="app">
          <div className="card">
            <div className="logo">AGENT<span>R</span></div>
            <div className="subtitle">Provisioning your agent</div>
            <div className="prov-steps">
              {provSteps.map((step, i) => (
                <div
                  key={i}
                  className={`prov-step ${i < provisioningStep ? 'done' : i === provisioningStep ? 'active' : ''}`}
                >
                  <div className="prov-dot" />
                  {step}
                </div>
              ))}
            </div>
            <div className="hint">This takes about 10 seconds. Don't close this tab.</div>
          </div>
        </div>
      )}

      {/* CHAT SCREEN */}
      {screen === 'chat' && agent && (
        <div className="app" style={{ padding: 0, justifyContent: 'stretch', alignItems: 'stretch' }}>
          <div className="chat-wrap" style={{ maxWidth: '100%' }}>
            <div className="chat-header">
              <div className="chat-header-left">
                <div className="status-dot" />
                <div>
                  <div className="agent-name">
                    {agent.firstName ? `${agent.firstName}'s Agent` : 'Your Agent'}
                  </div>
                  <div className="agent-sub">
                    {agent.username ? `@${agent.username}` : agent.phone}  TON AGENT
                  </div>
                </div>
              </div>
              {agent.tools && (
                <div className="tools-badge">{agent.tools} TOOLS</div>
              )}
            </div>

            <div className="chat-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`msg ${msg.role}`}>
                  {msg.content}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="msg-tools">
                      {msg.toolCalls.map((t, j) => (
                        <span key={j} className="tool-tag">{t.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="typing">
                  <div className="typing-dots">
                    <span /><span /><span />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="chat-input-area">
              <input
                type="text"
                placeholder="Tell your agent what to do..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                disabled={loading}
              />
              <button onClick={sendMessage} disabled={loading || !input.trim()}>
                Send 
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
