import { useState, useEffect } from 'react'
type Screen = 'phone' | 'otp' | 'twofa' | 'provisioning' | 'live'
interface AgentState { tenantId: string; phoneCodeHash: string; phone: string; username?: string; firstName?: string; tools?: number }
async function post(path: string, body: object) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.json()
}
export default function App() {
  const [screen, setScreen] = useState<Screen>('phone')
  const [agent, setAgent] = useState<AgentState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [twofa, setTwofa] = useState('')
  const [provStep, setProvStep] = useState(0)
  useEffect(() => {
    const saved = localStorage.getItem('agentr_tenant')
    if (saved) { try { setAgent(JSON.parse(saved)); setScreen('live') } catch { localStorage.removeItem('agentr_tenant') } }
  }, [])
  useEffect(() => {
    if (screen !== 'provisioning') return
    let i = 0; const t = setInterval(() => { i++; setProvStep(i); if (i >= 4) clearInterval(t) }, 700)
    return () => clearInterval(t)
  }, [screen])
  const goLive = async (tenantId: string) => {
    setScreen('provisioning')
    for (let a = 0; a < 20; a++) {
      await new Promise(r => setTimeout(r, 1500))
      try {
        const data = await (await fetch(`/agent/status/${tenantId}`)).json()
        if (data.status === 'online') {
          const saved = { tenantId, phone: agent?.phone ?? phone, username: data.telegram?.username, firstName: data.telegram?.firstName, tools: data.tools, phoneCodeHash: '' }
          setAgent(saved); localStorage.setItem('agentr_tenant', JSON.stringify(saved)); setScreen('live'); return
        }
      } catch {}
    }
    setScreen('live')
  }
  const handlePhone = async () => {
    setLoading(true); setError('')
    try { const d = await post('/auth/request-otp', { phone: phone.trim() }); if (!d.success) throw new Error(d.error); setAgent({ tenantId: d.tenantId, phoneCodeHash: d.phoneCodeHash, phone: d.phone }); setScreen('otp') }
    catch (e) { setError(String(e)) } finally { setLoading(false) }
  }
  const handleOtp = async () => {
    if (!agent) return; setLoading(true); setError('')
    try { const d = await post('/auth/verify-otp', { tenantId: agent.tenantId, phone: agent.phone, phoneCodeHash: agent.phoneCodeHash, code: otp.trim() }); if (d.error === '2FA_REQUIRED') { setScreen('twofa'); return }; if (!d.success) throw new Error(d.error); await goLive(agent.tenantId) }
    catch (e) { setError(String(e)) } finally { setLoading(false) }
  }
  const handle2FA = async () => {
    if (!agent) return; setLoading(true); setError('')
    try { const d = await post('/auth/verify-2fa', { tenantId: agent.tenantId, phone: agent.phone, password: twofa.trim() }); if (!d.success) throw new Error(d.error); await goLive(agent.tenantId) }
    catch (e) { setError(String(e)) } finally { setLoading(false) }
  }
  const steps = ['Generating TON wallet...','Spinning up container...','Loading 48 tools...','Connecting to Telegram...','Agent is live!']
  const css = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}:root{--bg:#080808;--s:#0f0f0f;--s2:#141414;--b:#1c1c1c;--a:#0EA5E9;--w:#efefef;--m:#666;--d:#333;--ok:#4ade80;--err:#f87171;--mono:'Space Mono',monospace;--dis:'Syne',sans-serif}html,body,#root{height:100%;background:var(--bg);color:var(--w);font-family:var(--mono)}.app{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{width:100%;max-width:420px;background:var(--s);border:1px solid var(--b);padding:40px;position:relative}.card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--a),transparent)}.logo{font-family:var(--dis);font-size:28px;font-weight:800;margin-bottom:4px}.logo span{color:var(--a)}.sub{font-size:11px;color:var(--m);letter-spacing:2px;text-transform:uppercase;margin-bottom:32px}.lbl{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--m);margin-bottom:8px}input{width:100%;background:var(--s2);border:1px solid var(--b);color:var(--w);font-family:var(--mono);font-size:14px;padding:12px 16px;outline:none;transition:border-color .2s;margin-bottom:16px}input:focus{border-color:var(--a)}input::placeholder{color:var(--d)}.btn{width:100%;background:var(--a);color:#000;border:none;font-family:var(--dis);font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:13px;cursor:pointer;transition:opacity .2s}.btn:hover{opacity:.9}.btn:disabled{opacity:.4;cursor:not-allowed}.ghost{background:transparent;color:var(--m);border:1px solid var(--b);font-family:var(--mono);font-size:10px;padding:8px 14px;cursor:pointer;letter-spacing:1px;text-transform:uppercase;margin-bottom:20px}.ghost:hover{color:var(--w)}.err{font-size:11px;color:var(--err);margin-top:12px;padding:10px 12px;background:rgba(248,113,113,.06);border-left:2px solid var(--err)}.hint{font-size:11px;color:var(--m);margin-top:12px;line-height:1.6}.ps{display:flex;align-items:center;gap:12px;padding:10px 0;font-size:12px;color:var(--d);border-bottom:1px solid var(--b);transition:color .3s}.ps.done{color:var(--ok)}.ps.act{color:var(--a)}.dot{width:6px;height:6px;border-radius:50%;background:var(--d);flex-shrink:0;transition:background .3s}.ps.done .dot{background:var(--ok)}.ps.act .dot{background:var(--a);animation:p 1s infinite}@keyframes p{0%,100%{opacity:1}50%{opacity:.4}}.ldot{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok);animation:p 2s infinite}.lst{display:flex;align-items:center;gap:8px;margin-bottom:24px}.stat{background:var(--s2);border:1px solid var(--b);padding:12px 16px;margin-bottom:8px;font-size:12px}.sl{color:var(--m);font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px}.tgbtn{display:block;text-align:center;margin-top:20px;padding:13px;background:#229ED9;color:#fff;font-family:var(--dis);font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase;text-decoration:none}.rst{font-size:10px;color:var(--d);text-align:center;margin-top:16px;cursor:pointer;letter-spacing:1px}.rst:hover{color:var(--m)}`
  return (<><style>{css}</style>
    {screen==='phone'&&<div className="app"><div className="card"><div className="logo">AGENT<span>R</span></div><div className="sub">AI Agent — TON & Telegram</div><div className="lbl">Your phone number</div><input type="tel" placeholder="+1 234 567 8900" value={phone} onChange={e=>setPhone(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handlePhone()} autoFocus/><button className="btn" onClick={handlePhone} disabled={loading||!phone.trim()}>{loading?'Sending...':'Get Code →'}</button>{error&&<div className="err">{error}</div>}<div className="hint">Enter your Telegram phone number.</div></div></div>}
    {screen==='otp'&&<div className="app"><div className="card"><button className="ghost" onClick={()=>{setScreen('phone');setError('')}}>← Back</button><div className="logo">AGENT<span>R</span></div><div className="sub">Check your Telegram app</div><div className="lbl">Verification code</div><input type="text" placeholder="12345" maxLength={5} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} onKeyDown={e=>e.key==='Enter'&&handleOtp()} autoFocus/><button className="btn" onClick={handleOtp} disabled={loading||otp.length!==5}>{loading?'Verifying...':'Verify & Launch Agent →'}</button>{error&&<div className="err">{error}</div>}<div className="hint">Code sent to {agent?.phone}.</div></div></div>}
    {screen==='twofa'&&<div className="app"><div className="card"><div className="logo">AGENT<span>R</span></div><div className="sub">2FA Required</div><div className="lbl">Cloud password</div><input type="password" placeholder="Your 2FA password" value={twofa} onChange={e=>setTwofa(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handle2FA()} autoFocus/><button className="btn" onClick={handle2FA} disabled={loading||!twofa.trim()}>{loading?'Verifying...':'Confirm →'}</button>{error&&<div className="err">{error}</div>}</div></div>}
    {screen==='provisioning'&&<div className="app"><div className="card"><div className="logo">AGENT<span>R</span></div><div className="sub">Provisioning your agent</div><div style={{margin:'24px 0'}}>{steps.map((s,i)=><div key={i} className={`ps ${i<provStep?'done':i===provStep?'act':''}`}><div className="dot"/>{s}</div>)}</div><div className="hint">Takes about 10 seconds.</div></div></div>}
    {screen==='live'&&agent&&<div className="app"><div className="card"><div className="logo">AGENT<span>R</span></div><div className="lst"><div className="ldot"/><span style={{fontSize:11,color:'var(--ok)',letterSpacing:2,textTransform:'uppercase'}}>Agent Live</span></div><div className="stat"><div className="sl">Telegram Account</div><div>{agent.username?`@${agent.username}`:agent.phone}</div></div>{agent.tools&&<div className="stat"><div className="sl">Tools Loaded</div><div>{agent.tools} tools active</div></div>}<div className="stat"><div className="sl">Status</div><div>Listening for DMs on Telegram</div></div><a className="tgbtn" href={`https://t.me/${agent.username??''}`} target="_blank" rel="noreferrer">Open in Telegram →</a><div className="rst" onClick={()=>{localStorage.removeItem('agentr_tenant');setScreen('phone');setAgent(null)}}>[ disconnect agent ]</div></div></div>}
  </>)
}
