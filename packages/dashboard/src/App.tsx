import React, { useState, useEffect } from 'react'
import { TonConnectUIProvider, TonConnectButton, useTonConnectUI, useTonAddress, useTonWallet } from '@tonconnect/ui-react'

type Screen = 'landing' | 'phone' | 'otp' | 'twofa' | 'provisioning' | 'live' | 'pricing' | 'setup'
type LiveTab = 'overview' | 'workspace' | 'bots' | 'activity' | 'credits' | 'miniapps' | 'tonsites' | 'subagents' | 'marketplace'

interface AgentState {
  tenantId: string
  phoneCodeHash: string
  phone: string
  username?: string
  firstName?: string
  walletAddress?: string
  provider?: string
}

declare const __API_URL__: string

function detectApiBase(): string {
  if (typeof __API_URL__ !== 'undefined' && __API_URL__) return __API_URL__
  if (typeof window === 'undefined') return ''
  const { protocol, hostname, port } = window.location
  if (port === '5173') return `${protocol}//${hostname}:3001`
  return ''
}

const API = detectApiBase()

async function post(path: string, body: object) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function apiGet(path: string) {
  const res = await fetch(API + path)
  return res.json()
}


function WorkspaceTab({ tenantId, apiBase }: { tenantId: string; apiBase: string }) {
  const [files, setFiles] = React.useState<string[]>([])
  const [activeFile, setActiveFile] = React.useState<string | null>(null)
  const [fileContent, setFileContent] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [mobileFilesOpen, setMobileFilesOpen] = React.useState(false)

  const CORE_FILES = ['SOUL.md','IDENTITY.md','STRATEGY.md','SECURITY.md','USER.md','MEMORY.md']
  const isLocked = (_f: string) => false // all files editable

  const loadFiles = async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase + '/agent/workspace/' + tenantId)
      const d = await res.json()
      if (d.files) {
        const sorted = [
          ...CORE_FILES.filter(f => d.files.includes(f)),
          ...d.files.filter((f: string) => !CORE_FILES.includes(f)).sort()
        ]
        setFiles(sorted)
        if (!activeFile && sorted.length > 0) openFile(sorted[0], apiBase)
      }
    } catch {} finally { setLoading(false) }
  }

  const openFile = async (name: string, base?: string) => {
    setActiveFile(name)
    setFileContent('')
    setMobileFilesOpen(false)
    try {
      const res = await fetch((base || apiBase) + '/agent/workspace/' + tenantId + '/' + encodeURIComponent(name))
      const d = await res.json()
      setFileContent(d.content ?? '')
    } catch { setFileContent('') }
  }

  const saveFile = async () => {
    if (!activeFile || isLocked(activeFile)) return
    setSaving(true)
    try {
      await fetch(apiBase + '/agent/workspace/' + tenantId + '/' + encodeURIComponent(activeFile), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fileContent })
      })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch {} finally { setSaving(false) }
  }

  React.useEffect(() => { loadFiles() }, [tenantId])

  return (
    <div className="workspace-container">
      {/* Mobile file list toggle */}
      <button 
        className="mobile-files-toggle"
        onClick={() => setMobileFilesOpen(!mobileFilesOpen)}
      >
        <span>{mobileFilesOpen ? '✕ Close' : '☰ Files'}</span>
        {activeFile && <span className="active-file-name">{activeFile}</span>}
      </button>
      
      {/* File sidebar - collapsible on mobile */}
      <div className={`ws-files ${mobileFilesOpen ? 'mobile-open' : ''}`}>
        <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',color:'var(--text3)',padding:'0 16px 10px'}}>Files</div>
        {loading ? (
          <div style={{padding:'16px',fontSize:13,color:'var(--text3)'}}>Loading...</div>
        ) : files.length === 0 ? (
          <div style={{padding:'16px',fontSize:13,color:'var(--text3)'}}>No files yet. Your agent creates files as it works.</div>
        ) : files.map(f => (
          <div key={f}
            onClick={() => openFile(f)}
            style={{padding:'9px 16px',fontSize:13,cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,
              background: activeFile===f ? 'var(--blue-bg)' : 'transparent',
              color: activeFile===f ? 'var(--blue)' : 'var(--text2)',
              borderLeft: activeFile===f ? '2px solid var(--blue)' : '2px solid transparent',
              transition:'all .15s'}}>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f}</span>
            {CORE_FILES.includes(f) && <span style={{fontSize:10,color:'var(--text3)',flexShrink:0}}>core</span>}
          </div>
        ))}
      </div>
      
      {/* Overlay for mobile */}
      {mobileFilesOpen && (
        <div className="mobile-files-overlay" onClick={() => setMobileFilesOpen(false)} />
      )}
      
      {/* Editor */}
      <div className="ws-editor">
        {activeFile ? (<>
          <div className="ws-editor-head">
            <span className="ws-file-name">{activeFile}</span>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              {isLocked(activeFile)
                ? null
                : <button onClick={saveFile} disabled={saving}
                    className={`ws-save-btn ${saved ? 'saved' : ''}`}>
                    {saved ? 'Saved' : saving ? 'Saving...' : 'Save'}
                  </button>
              }
              <button onClick={loadFiles} className="ws-refresh-btn">Refresh</button>
            </div>
          </div>
          <textarea
            value={fileContent}
            onChange={e => setFileContent(e.target.value)}
            readOnly={isLocked(activeFile)}
            className="ws-textarea"
            placeholder={isLocked(activeFile) ? 'This file is managed by AGENTR' : 'Empty file...'}
          />
        </>) : (
          <div className="ws-empty">
            Select a file to view or edit
          </div>
        )}
      </div>
    </div>
  )
}


function MarketplaceTab({ tenantId }: { tenantId: string }) {
  const [agents, setAgents] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState('All')
  const [deploying, setDeploying] = React.useState<string|null>(null)
  const [deployed, setDeployed] = React.useState<string|null>(null)
  const [view, setView] = React.useState<'browse'|'dev-login'|'dev-register'|'dev-dashboard'|'dev-submit'>('browse')
  const [devToken, setDevToken] = React.useState(() => localStorage.getItem('agentr_dev_token') ?? '')
  const [devData, setDevData] = React.useState<any>(null)
  const [loginForm, setLoginForm] = React.useState({email:'',password:''})
  const [regForm, setRegForm] = React.useState({name:'',email:'',password:'',telegram:'',wallet:'',category:'',bio:''})
  const [submitForm, setSubmitForm] = React.useState({name:'',description:'',category:'',github:'',test_account:'',notes:'',price_credits:0})
  const [formError, setFormError] = React.useState('')
  const [formLoading, setFormLoading] = React.useState(false)
  const API = detectApiBase()
  const CATS = ['All','TON/DeFi','Commerce','Productivity','Utility']
  const DEV_CATS = ['TON/DeFi','Commerce','Productivity','Utility','Entertainment','Education','Other']

  React.useEffect(() => {
    fetch(API + '/agent/marketplace').then(r=>r.json()).then(d=>{if(d.agents)setAgents(d.agents)}).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  React.useEffect(() => {
    if (!devToken) return
    fetch(API + '/agent/dev/profile/' + devToken).then(r=>r.json()).then(d=>{
      if (d.success) { setDevData(d); setView('dev-dashboard') }
      else { localStorage.removeItem('agentr_dev_token'); setDevToken('') }
    }).catch(()=>{})
  }, [devToken])

  const deploy = async (agentId: string) => {
    setDeploying(agentId)
    try {
      const res = await fetch(API + '/agent/marketplace/deploy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({tenantId, agentId}) })
      const d = await res.json()
      if (d.success) { setDeployed(agentId); setTimeout(()=>setDeployed(null), 3000) }
    } catch {} finally { setDeploying(null) }
  }

  const handleLogin = async () => {
    setFormLoading(true); setFormError('')
    try {
      const res = await fetch(API + '/agent/dev/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(loginForm) })
      const d = await res.json()
      if (!d.success) { setFormError(d.error); return }
      localStorage.setItem('agentr_dev_token', d.token)
      setDevToken(d.token)
      // Fetch profile immediately after login
      try {
        const p = await fetch(API + '/agent/dev/profile/' + d.token).then(r=>r.json())
        if (p.success) { setDevData(p); setView('dev-dashboard') }
      } catch {}
    } catch { setFormError('Something went wrong') } finally { setFormLoading(false) }
  }

  const handleRegister = async () => {
    setFormLoading(true); setFormError('')
    if (!regForm.category) { setFormError('Please select a category'); setFormLoading(false); return }
    try {
      const res = await fetch(API + '/agent/dev/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(regForm) })
      const d = await res.json()
      if (!d.success) { setFormError(d.error); return }
      localStorage.setItem('agentr_dev_token', d.token)
      setDevToken(d.token)
      // Fetch profile immediately after register
      try {
        const p = await fetch(API + '/agent/dev/profile/' + d.token).then(r=>r.json())
        if (p.success) { setDevData(p); setView('dev-dashboard') }
      } catch {}
    } catch { setFormError('Something went wrong') } finally { setFormLoading(false) }
  }

  const handleSubmitAgent = async () => {
    setFormLoading(true); setFormError('')
    try {
      const res = await fetch(API + '/agent/dev/submit-agent', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name:submitForm.name,description:submitForm.description,category:submitForm.category,github:submitForm.github,test_account:submitForm.test_account,notes:submitForm.notes,token:devToken}) })
      const d = await res.json()
      if (!d.success) { setFormError(d.error); return }
      setView('dev-dashboard')
      // Refresh profile
      const p = await fetch(API + '/agent/dev/profile/' + devToken).then(r=>r.json())
      if (p.success) setDevData(p)
    } catch { setFormError('Something went wrong') } finally { setFormLoading(false) }
  }

  const handleWithdraw = async () => {
    try {
      const res = await fetch(API + '/agent/dev/withdraw', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({token: devToken}) })
      const d = await res.json()
      if (d.success) alert('Withdrawal request submitted! ' + d.amount + ' credits → ' + d.wallet)
      else alert(d.error)
    } catch {}
  }

  const cardStyle = {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'28px',display:'flex',flexDirection:'column' as const,gap:14}
  const inputStyle = {width:'100%',background:'var(--bg)',border:'1px solid var(--border2)',borderRadius:8,color:'var(--text)',fontFamily:'var(--f)',fontSize:14,padding:'10px 14px',outline:'none'}
  const labelStyle = {fontSize:12,fontWeight:500,color:'var(--text2)',marginBottom:4,display:'block' as const}
  const btnBlue = {fontFamily:'var(--f)',fontSize:14,fontWeight:500,padding:'11px',borderRadius:8,border:'none',background:'#0098EA',color:'#fff',cursor:'pointer',width:'100%'}
  const btnBlack = {fontFamily:'var(--f)',fontSize:14,fontWeight:500,padding:'11px',borderRadius:8,border:'none',background:'#141413',color:'#ffffff',cursor:'pointer',width:'100%'}

  // DEV LOGIN
  if (view === 'dev-login') return (
    <div style={{padding:'32px',maxWidth:440,margin:'0 auto',minHeight:'100vh'}}>
      <button onClick={()=>setView('browse')} style={{fontFamily:'var(--f)',fontSize:13,color:'var(--text2)',background:'none',border:'none',cursor:'pointer',marginBottom:24,padding:0}}>← Back</button>
      <div style={{fontFamily:'var(--serif)',fontSize:28,fontWeight:400,marginBottom:4}}>Developer login</div>
      <div style={{fontSize:14,color:'var(--text2)',marginBottom:28}}>Sign in to your developer account.</div>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'28px',display:'flex',flexDirection:'column',gap:14}}>
        <div><label style={labelStyle}>Email</label><input style={inputStyle} type="email" placeholder="you@example.com" value={loginForm.email} onChange={e=>setLoginForm(p=>({...p,email:e.target.value}))} /></div>
        <div><label style={labelStyle}>Password</label><input style={inputStyle} type="password" placeholder="••••••••" value={loginForm.password} onChange={e=>setLoginForm(p=>({...p,password:e.target.value}))} /></div>
        {formError && <div style={{fontSize:13,color:'var(--err)',background:'var(--err-bg)',padding:'10px 14px',borderRadius:8}}>{formError}</div>}
        <button style={btnBlack} onClick={handleLogin} disabled={formLoading}>{formLoading ? 'Signing in...' : 'Sign in'}</button>
        <div style={{textAlign:'center',fontSize:13,color:'var(--text3)'}}>No account? <button onClick={()=>setView('dev-register')} style={{fontFamily:'var(--f)',fontSize:13,color:'var(--blue)',background:'none',border:'none',cursor:'pointer',padding:0}}>Register</button></div>
      </div>
    </div>
  )

  // DEV REGISTER
  if (view === 'dev-register') return (
    <div style={{padding:'32px',maxWidth:480,margin:'0 auto',minHeight:'100vh'}}>
      <button onClick={()=>setView('dev-login')} style={{fontFamily:'var(--f)',fontSize:13,color:'var(--text2)',background:'none',border:'none',cursor:'pointer',marginBottom:24,padding:0}}>← Back</button>
      <div style={{fontFamily:'var(--serif)',fontSize:28,fontWeight:400,marginBottom:4}}>Create dev account</div>
      <div style={{fontSize:14,color:'var(--text2)',marginBottom:28}}>Build agents, publish them, earn 75% of every credit spent on your work.</div>
      <div style={cardStyle}>
        {[
          {key:'name',label:'Full name',placeholder:'Your name',type:'text'},
          {key:'email',label:'Email',placeholder:'you@example.com',type:'email'},
          {key:'password',label:'Password',placeholder:'At least 6 characters',type:'password'},
          {key:'telegram',label:'Telegram username',placeholder:'@yourhandle',type:'text'},
          {key:'wallet',label:'TON wallet (for earnings)',placeholder:'UQ...',type:'text'},
        ].map(f => (
          <div key={f.key}><label style={labelStyle}>{f.label}</label><input style={inputStyle} type={f.type} placeholder={f.placeholder} value={(regForm as any)[f.key]} onChange={e=>setRegForm(p=>({...p,[f.key]:e.target.value}))} /></div>
        ))}
        <div>
          <label style={labelStyle}>Your specialty</label>
          <div style={{display:'flex',flexWrap:'wrap' as const,gap:8,marginTop:4}}>
            {DEV_CATS.map(c => (
              <button key={c} onClick={()=>setRegForm(p=>({...p,category:c}))}
                style={{fontFamily:'var(--f)',fontSize:12,padding:'6px 14px',borderRadius:100,border:'1px solid var(--border)',cursor:'pointer',
                  background:regForm.category===c?'#141413':'#F4F3EE',color:regForm.category===c?'#ffffff':'#1A1916'}}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div><label style={labelStyle}>Bio (optional)</label><textarea style={{...inputStyle,height:80,resize:'none' as const}} placeholder="Tell us what you build..." value={regForm.bio} onChange={e=>setRegForm(p=>({...p,bio:e.target.value}))} /></div>
        {formError && <div style={{fontSize:13,color:'var(--err)',background:'var(--err-bg)',padding:'10px 14px',borderRadius:8}}>{formError}</div>}
        <button style={btnBlack} onClick={handleRegister} disabled={formLoading}>{formLoading ? 'Creating account...' : 'Create account'}</button>
      </div>
    </div>
  )

  // DEV DASHBOARD
  if (view === 'dev-dashboard' && devData) {
    const dev = devData.dev
    const devAgents = devData.agents ?? []
    const canWithdraw = dev.earnings_credits >= 1000
    return (
      <div style={{padding:'32px',maxWidth:700,display:'flex',flexDirection:'column',gap:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontFamily:'var(--serif)',fontSize:24,fontWeight:400}}>Dev Dashboard</div>
            <div style={{fontSize:13,color:'var(--text2)',marginTop:2}}>Hey {dev.name} · {dev.category}</div>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <a href="https://github.com/daraijaola/agentr" target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:6,fontFamily:'var(--f)',fontSize:13,color:'var(--text2)',background:'var(--bg)',border:'1px solid var(--border)',padding:'8px 14px',borderRadius:8,textDecoration:'none'}}>
              <img src="/github.png" alt="GitHub" style={{width:16,height:16,objectFit:'contain'}} /> Docs
            </a>
            <button onClick={()=>setView('dev-submit')} style={{fontFamily:'var(--f)',fontSize:13,fontWeight:500,padding:'8px 18px',borderRadius:8,border:'none',background:'var(--blue)',color:'#fff',cursor:'pointer'}}>Submit agent</button>
            <button onClick={()=>{localStorage.removeItem('agentr_dev_token');setDevToken('');setDevData(null);setView('browse')}} style={{fontFamily:'var(--f)',fontSize:13,color:'var(--text3)',background:'none',border:'1px solid var(--border)',padding:'8px 14px',borderRadius:8,cursor:'pointer'}}>Sign out</button>
          </div>
        </div>

        {/* Earnings card */}
        <div style={{...cardStyle,flexDirection:'row' as const,alignItems:'center',justifyContent:'space-between',gap:20}}>
          <div>
            <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase' as const,letterSpacing:'.6px',color:'var(--text3)',marginBottom:6}}>Total earnings</div>
            <div style={{fontSize:36,fontWeight:600,color:'var(--blue)',letterSpacing:'-.5px'}}>{dev.earnings_credits.toLocaleString()}</div>
            <div style={{fontSize:12,color:'var(--text3)'}}>credits · ${(dev.earnings_credits * 0.001).toFixed(2)} USD equiv.</div>
          </div>
          <div style={{textAlign:'right' as const}}>
            <button onClick={handleWithdraw} disabled={!canWithdraw}
              style={{fontFamily:'var(--f)',fontSize:13,fontWeight:500,padding:'10px 20px',borderRadius:8,border:'none',
                background:canWithdraw?'var(--black)':'var(--bg2)',
                color:canWithdraw?'#fff':'var(--text3)',
                cursor:canWithdraw?'pointer':'not-allowed'}}>
              Withdraw to TON
            </button>
            <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Min. 1,000 credits</div>
          </div>
        </div>

        {/* Status */}
        {!dev.approved && (
          <div style={{background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:10,padding:'14px 18px',fontSize:13,color:'#92400e'}}>
            Your account is pending review. Agents you submit will appear in the marketplace once approved (usually within 48 hours).
          </div>
        )}

        {/* Agent list */}
        <div>
          <div style={{fontSize:11,fontWeight:500,textTransform:'uppercase' as const,letterSpacing:'.6px',color:'var(--text3)',marginBottom:12}}>Your agents ({devAgents.length})</div>
          {devAgents.length === 0 ? (
            <div style={{...cardStyle,alignItems:'center',textAlign:'center' as const,padding:'48px',gap:8}}>
              <div style={{fontSize:14,fontWeight:500}}>No agents yet</div>
              <div style={{fontSize:13,color:'var(--text2)'}}>Submit your first agent to start earning.</div>
              <button onClick={()=>setView('dev-submit')} style={{...btnBlue,width:'auto',padding:'8px 20px',marginTop:8}}>Submit your first agent</button>
            </div>
          ) : devAgents.map((a:any) => (
            <div key={a.id} style={{...cardStyle,flexDirection:'row' as const,alignItems:'center',marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:500}}>{a.name}</div>
                <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>{a.category} · {a.installs} installs · {a.rating} ★</div>
              </div>
              <span style={{fontSize:11,padding:'3px 10px',borderRadius:100,
                background:a.active?'var(--ok-bg)':'var(--bg2)',
                color:a.active?'var(--ok)':'var(--text3)',
                border:`1px solid ${a.active?'var(--ok-bdr)':'var(--border)'}`}}>
                {a.active ? 'Live' : 'Under review'}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // DEV SUBMIT AGENT
  if (view === 'dev-submit') return (
    <div style={{padding:'32px',maxWidth:560}}>
      <button onClick={()=>setView('dev-dashboard')} style={{fontFamily:'var(--f)',fontSize:13,color:'var(--text2)',background:'none',border:'none',cursor:'pointer',marginBottom:24,padding:0}}>← Back</button>
      <div style={{fontFamily:'var(--serif)',fontSize:28,fontWeight:400,marginBottom:4}}>Submit an agent</div>
      <div style={{fontSize:14,color:'var(--text2)',marginBottom:28}}>Fill in your agent details. The AGENTR team reviews within 48 hours.</div>
      <div style={cardStyle}>
        {[
          {key:'name',label:'Agent name',placeholder:'e.g. TON Price Tracker'},
          {key:'description',label:'Description',placeholder:'What does this agent do? Be specific.'},
        ].map(f => (
          <div key={f.key}><label style={labelStyle}>{f.label}</label><input style={inputStyle} placeholder={f.placeholder} value={(submitForm as any)[f.key]} onChange={e=>setSubmitForm(p=>({...p,[f.key]:e.target.value}))} /></div>
        ))}
        <div>
          <label style={labelStyle}>Category</label>
          <div style={{display:'flex',flexWrap:'wrap' as const,gap:8,marginTop:4}}>
            {DEV_CATS.filter(c=>c!=='Other').map(c=>(
              <button key={c} onClick={()=>setSubmitForm(p=>({...p,category:c}))}
                style={{fontFamily:'var(--f)',fontSize:12,padding:'6px 14px',borderRadius:100,border:'1px solid var(--border)',cursor:'pointer',
                  background:submitForm.category===c?'#141413':'#F4F3EE',color:submitForm.category===c?'#ffffff':'#1A1916'}}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>GitHub repository URL</label>
          <input style={inputStyle} placeholder="https://github.com/yourname/your-agent" value={submitForm.github} onChange={e=>setSubmitForm(p=>({...p,github:e.target.value}))} />
          <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>Your repo must contain SOUL.md, IDENTITY.md and STRATEGY.md files. We will review the code before approving.</div>
        </div>
        <div>
          <label style={labelStyle}>Test Telegram account</label>
          <input style={inputStyle} placeholder="@username — the account you tested this agent on" value={submitForm.test_account} onChange={e=>setSubmitForm(p=>({...p,test_account:e.target.value}))} />
        </div>
        <div>
          <label style={labelStyle}>Additional notes (optional)</label>
          <textarea style={{...inputStyle,height:80,resize:'none' as const}} placeholder="Anything else we should know — special setup, dependencies, limitations..." value={submitForm.notes} onChange={e=>setSubmitForm(p=>({...p,notes:e.target.value}))} />
        </div>
        {formError && <div style={{fontSize:13,color:'var(--err)',background:'var(--err-bg)',padding:'10px 14px',borderRadius:8}}>{formError}</div>}
        <button style={btnBlack} onClick={handleSubmitAgent} disabled={formLoading}>{formLoading ? 'Submitting...' : 'Submit for review'}</button>
      </div>
    </div>
  )

  // BROWSE MARKETPLACE
  const filtered = filter === 'All' ? agents : agents.filter(a => a.category === filter)
  return (
    <div style={{padding:'32px',display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontFamily:'var(--serif)',fontSize:24,fontWeight:400,marginBottom:4}}>Marketplace</div>
          <div style={{fontSize:13,color:'var(--text2)'}}>Deploy community-built agents to your account in one click.</div>
        </div>
        <button onClick={()=>devToken ? setView('dev-dashboard') : setView('dev-login')}
          style={{fontFamily:'var(--f)',fontSize:13,fontWeight:500,color:'var(--blue)',background:'var(--blue-bg)',border:'1px solid var(--blue)',padding:'8px 18px',borderRadius:8,cursor:'pointer'}}>
          {devToken ? 'Dev Dashboard' : 'I am a developer →'}
        </button>
      </div>

      <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
        {CATS.map(c=>(
          <button key={c} onClick={()=>setFilter(c)}
            style={{fontFamily:'var(--f)',fontSize:13,padding:'6px 16px',borderRadius:100,
              border: filter===c ? '1px solid #141413' : '1px solid #D4D0C8',
              cursor:'pointer',
              background: filter===c ? '#141413' : '#fff',
              color: filter===c ? '#fff' : '#6B6760',
              fontWeight: filter===c ? 500 : 400,
              transition:'all .15s'}}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{fontSize:13,color:'var(--text3)'}}>Loading agents...</div>
      ) : filtered.length === 0 ? (
        <div style={{textAlign:'center' as const,padding:'64px 0',color:'var(--text2)',fontSize:14}}>
          <div style={{fontFamily:'var(--serif)',fontSize:22,marginBottom:8}}>No agents yet</div>
          <div>Be the first to publish an agent in this category.</div>
          <button onClick={()=>devToken ? setView('dev-submit') : setView('dev-login')} style={{...btnBlue,width:'auto',padding:'10px 24px',marginTop:20,display:'inline-block'}}>Publish an agent</button>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
          {filtered.map(a=>(
            <div key={a.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'20px',display:'flex',flexDirection:'column' as const,gap:10}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                    <span style={{fontSize:14,fontWeight:600}}>{a.name}</span>
                    {a.verified&&<span style={{fontSize:10,background:'var(--blue-bg)',color:'var(--blue)',padding:'1px 7px',borderRadius:100,fontWeight:500}}>Official</span>}
                  </div>
                  <span style={{fontSize:11,background:'var(--bg2)',border:'1px solid var(--border)',color:'var(--text3)',padding:'2px 8px',borderRadius:100}}>{a.category}</span>
                </div>
                <div style={{fontSize:12,color:'var(--text3)',textAlign:'right' as const,flexShrink:0}}>
                  <div>{a.rating} ★</div>
                  <div>{a.installs.toLocaleString()} installs</div>
                </div>
              </div>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6,flex:1}}>{a.description}</div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:4}}>
                <span style={{fontSize:12,color:'var(--text3)'}}>by {a.creator_name ?? 'Community'}</span>
                <button onClick={()=>deploy(a.id)} disabled={deploying===a.id}
                  style={{fontFamily:'var(--f)',fontSize:12,fontWeight:500,padding:'7px 18px',borderRadius:7,border:'none',cursor:'pointer',
                    background:deployed===a.id?'var(--ok)':'var(--blue)',color:'#fff',opacity:deploying===a.id?0.6:1}}>
                  {deployed===a.id?'Deployed!':deploying===a.id?'Deploying...':'Deploy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function CreditsTab({ tenantId, tonWallet, tonConnectUI }: { tenantId: string; tonWallet: any; tonConnectUI: any }) {
  const [data, setData] = React.useState<{credits:number;totalUsed:number;totalAdded:number;transactions:{amount:number;type:string;description:string;model:string;created_at:string}[]}>({credits:0,totalUsed:0,totalAdded:0,transactions:[]})
  const [loading, setLoading] = React.useState(true)
  const API = detectApiBase()

  React.useEffect(() => {
    fetch(API + '/agent/credits-usage/' + tenantId)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tenantId])

  const PLAN_CREDITS: Record<string, number> = { free: 500, starter: 7500, pro: 20000, elite: 40000 }
  const planLimit = 100000
  const pct = Math.min(100, Math.round((data.credits / planLimit) * 100))

  return (
    <div style={{padding:'32px',maxWidth:640,display:'flex',flexDirection:'column',gap:20}}>
      <div style={{fontFamily:'var(--serif)',fontSize:24,fontWeight:400,letterSpacing:'-.3px'}}>Credits</div>

      {/* Balance card */}
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'24px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0}}>
        {[
          {label:'Balance',value:data.credits.toLocaleString(),sub:'credits remaining',color:'var(--blue)'},
          {label:'Used this month',value:data.totalUsed.toLocaleString(),sub:'credits consumed',color:'var(--text)'},
          {label:'Added total',value:data.totalAdded.toLocaleString(),sub:'credits received',color:'var(--ok)'},
        ].map((item,i) => (
          <div key={item.label} style={{padding:'0 20px',borderRight:i<2?'1px solid var(--border)':'none',display:'flex',flexDirection:'column',gap:4}}>
            <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'.6px',color:'var(--text3)'}}>{item.label}</div>
            <div style={{fontSize:28,fontWeight:600,color:item.color,letterSpacing:'-.5px'}}>{item.value}</div>
            <div style={{fontSize:12,color:'var(--text3)'}}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'20px 24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
          <span style={{fontSize:13,fontWeight:500}}>Credit balance</span>
          <span style={{fontSize:13,color:'var(--text3)'}}>{pct}% remaining</span>
        </div>
        <div style={{background:'var(--bg2)',borderRadius:100,height:8,overflow:'hidden'}}>
          <div style={{height:'100%',borderRadius:100,background:pct > 20 ? 'var(--blue)' : 'var(--err)',width:pct+'%',transition:'width .4s'}} />
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
          <span style={{fontSize:11,color:'var(--text3)'}}>0</span>
          <span style={{fontSize:11,color:'var(--text3)'}}>{planLimit.toLocaleString()} total</span>
        </div>
      </div>

      {/* Credit costs reference */}
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'20px 24px'}}>
        <div style={{fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'.6px',color:'var(--text3)',marginBottom:14}}>Credit costs</div>
        <div style={{display:'flex',flexDirection:'column',gap:0}}>
          {[
            {action:'Message (Kimi)',cost:'3 credits',note:'~$0.003'},
            {action:'Message (GPT-4o)',cost:'9 credits',note:'~$0.009'},
            {action:'Message (Claude)',cost:'13 credits',note:'~$0.013'},
            {action:'Message (Gemini)',cost:'8 credits',note:'~$0.008'},
            {action:'Tool call',cost:'1 credit',note:'free tier'},
            {action:'Bot deployment',cost:'10 credits',note:'one-time'},
            {action:'Codex (free tier)',cost:'0 credits',note:'no charge'},
          ].map((item,i) => (
            <div key={item.action} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:i<6?'1px solid var(--border)':'none'}}>
              <div>
                <span style={{fontSize:13,fontWeight:500}}>{item.action}</span>
                <span style={{fontSize:12,color:'var(--text3)',marginLeft:8}}>{item.note}</span>
              </div>
              <span style={{fontSize:13,color:'var(--blue)',fontWeight:500}}>{item.cost}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top up section */}
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'20px 24px'}}>
        <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>Top up credits</div>
        <div style={{fontSize:13,color:'var(--text2)',marginBottom:16}}>Pay with TON. Credits are added instantly after payment confirms.</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:12}}>
          {[
            {usd:5,  credits:5500,  ton:'3.8'},
            {usd:10, credits:12000, ton:'7.5'},
            {usd:25, credits:32000, ton:'18.8'},
          ].map(pack => (
            <button key={pack.usd}
              onClick={async () => {
                if (!tonWallet) { tonConnectUI.openModal(); return }
                const nanoton = Math.ceil(parseFloat(pack.ton) * 1_000_000_000)
                try {
                  await tonConnectUI.sendTransaction({
                    validUntil: Math.floor(Date.now() / 1000) + 300,
                    messages: [{ address: 'UQAKcLE05XnFDeVVDxRHnBNzxFHsYNojckqJCdCsL32qmy2M', amount: String(nanoton) }]
                  })
                  alert('Payment sent! ' + pack.credits.toLocaleString() + ' credits will be added within a few minutes.')
                } catch (e: any) {
                  if (String(e).includes('reject') || String(e).includes('cancel')) return
                  tonConnectUI.openModal()
                }
              }}
              style={{fontFamily:'var(--f)',padding:'14px 10px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',textAlign:'center' as const,transition:'border-color .15s'}}
              onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--blue)')}
              onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}>
              <div style={{fontSize:18,fontWeight:600,color:'var(--blue)',marginBottom:2}}>${pack.usd}</div>
              <div style={{fontSize:13,fontWeight:500}}>{pack.credits.toLocaleString()} credits</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{pack.ton} TON</div>
            </button>
          ))}
        </div>
        {!tonWallet && (
          <div style={{fontSize:12,color:'var(--text3)',textAlign:'center' as const}}>
            Connect your TON wallet in the top bar to pay
          </div>
        )}
      </div>

      {/* Transaction history */}
      <div>
        <div style={{fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'.6px',color:'var(--text3)',marginBottom:12}}>Transaction history</div>
        {loading ? (
          <div style={{fontSize:13,color:'var(--text3)'}}>Loading...</div>
        ) : data.transactions.length === 0 ? (
          <div style={{fontSize:13,color:'var(--text2)',padding:'24px 0'}}>No transactions yet. Credits will be deducted as you use your agent.</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {data.transactions.map((tx,i) => (
              <div key={i} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:500}}>{tx.description || tx.type}</div>
                  <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{tx.model ? tx.model + ' · ' : ''}{new Date(tx.created_at).toLocaleString()}</div>
                </div>
                <span style={{fontSize:14,fontWeight:600,color:tx.amount > 0 ? 'var(--ok)' : 'var(--err)'}}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BotsTab({ tenantId }: { tenantId: string }) {
  const [procs, setProcs] = React.useState<{name:string;status:string;pid:number}[]>([])
  const [logs, setLogs] = React.useState<{[k:string]:string}>({})
  const [loading, setLoading] = React.useState(true)
  const [viewLogs, setViewLogs] = React.useState<string|null>(null)

  const API = detectApiBase()

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(API + '/agent/processes/' + tenantId)
      const d = await res.json()
      if (d.processes) setProcs(d.processes)
    } catch {} finally { setLoading(false) }
  }

  const fetchLogs = async (name: string) => {
    try {
      const res = await fetch(API + '/agent/logs/' + tenantId + '/' + name)
      const d = await res.json()
      if (d.logs) setLogs(prev => ({...prev, [name]: d.logs}))
    } catch {}
    setViewLogs(name)
  }

  const stopProc = async (name: string) => {
    try {
      await fetch(API + '/agent/process/stop', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({tenantId, name}) })
      load()
    } catch {}
  }

  React.useEffect(() => { load() }, [])

  return (
    <div className="tab-content">
      <div className="tab-header">
        <div className="tab-title">Bots & Processes</div>
        <button onClick={load} className="ws-refresh-btn">Refresh</button>
      </div>
      {loading ? (
        <div style={{color:'var(--text3)',fontSize:14}}>Loading...</div>
      ) : procs.length === 0 ? (
        <div className="bots-empty">
          <div style={{fontWeight:500,marginBottom:6}}>No bots running yet.</div>
          <div>Message your agent on Telegram and ask it to create and deploy a bot.</div>
        </div>
      ) : (
        <div className="bots-list">
          {procs.map(p => (
            <div key={p.name} className="bot-card">
              <div className="bot-card-header">
                <div style={{display:'flex',alignItems:'center',gap:12,flex:1,minWidth:0}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:p.status==='online'?'var(--ok)':'var(--err)',flexShrink:0,boxShadow:p.status==='online'?'0 0 6px var(--ok)':'none'}}/>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{fontSize:14,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
                    <div style={{fontSize:12,color:'var(--text3)'}}>{p.status} · PID {p.pid}</div>
                  </div>
                </div>
                <div className="bot-actions">
                  <button onClick={()=>fetchLogs(p.name)} className="bot-btn-logs">Logs</button>
                  <button onClick={()=>stopProc(p.name)} className="bot-btn-stop">Stop</button>
                </div>
              </div>
              {viewLogs===p.name && logs[p.name] && (
                <pre className="bot-logs">{logs[p.name]}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityTab({ tenantId }: { tenantId: string }) {
  const [msgs, setMsgs] = React.useState<{id:string;userMessage:string;reply:string;toolCalls?:{name:string}[];createdAt:string}[]>([])
  const [loading, setLoading] = React.useState(true)
  const API = detectApiBase()

  React.useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(API + '/agent/activity/' + tenantId)
        const d = await res.json()
        if (d.activity) setMsgs(d.activity)
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  return (
    <div className="tab-content">
      <div className="tab-title" style={{marginBottom:6}}>Activity</div>
      <div style={{fontSize:14,color:'var(--text2)',marginBottom:20}}>Recent tasks your agent has completed.</div>
      {loading ? (
        <div style={{color:'var(--text3)',fontSize:14}}>Loading...</div>
      ) : msgs.length === 0 ? (
        <div className="activity-empty">No activity yet. Message your agent on Telegram to get started.</div>
      ) : (
        <div className="activity-list">
          {msgs.map(m => (
            <div key={m.id} className="activity-item">
              <div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{m.userMessage}</div>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>{m.reply?.slice(0,160)}{m.reply?.length>160?'...':''}</div>
              {m.toolCalls && m.toolCalls.length>0 && (
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {m.toolCalls.map(t=><span key={t.name} className="activity-tool">{t.name}</span>)}
                </div>
              )}
              <div style={{fontSize:11,color:'var(--text3)'}}>{new Date(m.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
  const [provider, setProvider] = useState('codex')
  const [switchingProvider, setSwitchingProvider] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('agentr_tenant')
    if (saved) {
      try {
        const a = JSON.parse(saved)
        setAgent(a)
        setProvider(a.provider ?? 'codex')
        setScreen('live')
        apiGet('/agent/status/' + a.tenantId).then(d => {
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

  useEffect(() => {
    if (screen !== 'provisioning') return
    let i = 0
    const t = setInterval(() => { i++; setProvStep(i); if (i >= 4) clearInterval(t) }, 1000)
    return () => clearInterval(t)
  }, [screen])

  const goLive = async (tenantId: string) => {
    setScreen('provisioning')
    for (let a = 0; a < 20; a++) {
      await new Promise(r => setTimeout(r, 1500))
      try {
        const data = await apiGet(`/agent/status/${tenantId}`)
        if (data.status === 'online') {
          const saved = {
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
      setAgent({ tenantId: d.tenantId, phoneCodeHash: d.phoneCodeHash, phone: d.phone })
      setScreen('setup')
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
      setScreen('pricing')
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  const handle2FA = async () => {
    if (!agent) return
    setLoading(true); setError('')
    try {
      const d = await post('/auth/verify-2fa', {
        tenantId: agent.tenantId, phone: agent.phone, password: twofa.trim(),
      })
      if (!d.success) throw new Error(d.error)
      setScreen('pricing')
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  const handleSubscribe = async (planId: string, priceUsd: number) => {
    const AGENTR_WALLET = 'UQAKcLE05XnFDeVVDxRHnBNzxFHsYNojckqJCdCsL32qmy2M'
    const TON_PRICE_USD = 5.2
    const nanoton = Math.ceil((priceUsd / TON_PRICE_USD) * 1_000_000_000)
    if (!tonWallet) {
      tonConnectUI.openModal()
      return
    }
    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{
          address: AGENTR_WALLET,
          amount: String(nanoton),
        }]
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
      // Write setup preferences to workspace — only on fresh provision
      const existingCheck = await fetch(API + '/agent/workspace/' + agent.tenantId + '/SOUL.md').then(r=>r.json()).catch(()=>({content:''}))
      const isFirstTime = !existingCheck.content || existingCheck.content.length < 100
      if (isFirstTime && (setupData.agentName || setupData.ownerName || setupData.dmPolicy !== 'contacts')) {
        const userContent = `# User\n\nOwner name: ${setupData.ownerName || 'Not set'}\nAgent name: ${setupData.agentName || 'Not set'}\nDM policy: ${setupData.dmPolicy}\n\nThis file is updated automatically as the agent learns more about the owner.`
        const ownerLine = setupData.ownerName ? `\n\nYour owner's name is ${setupData.ownerName}. Always address them by this name.` : ''
        const agentLine = setupData.agentName ? `\n\nYour name is ${setupData.agentName}. When introducing yourself, use this name.` : ''
        const soulAddition = ownerLine + agentLine
        try {
          await fetch(API + '/agent/workspace/' + agent.tenantId + '/USER.md', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ content: userContent })
          })
          if (setupData.agentName) {
            const soulRes = await fetch(API + '/agent/workspace/' + agent.tenantId + '/SOUL.md')
            const soulData = await soulRes.json()
            await fetch(API + '/agent/workspace/' + agent.tenantId + '/SOUL.md', {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ content: (soulData.content || '') + soulAddition })
            })
          }
        } catch {}
      }
      await post('/agent/start-trial', { tenantId: agent.tenantId })
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

  useEffect(() => {
    if (screen !== 'live' || !agent) return
    apiGet('/agent/credits/' + agent.tenantId)
      .then(d => { if (typeof d.credits === 'number') setCredits(d.credits) })
      .catch(() => {})
  }, [screen, agent])

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

  const STEPS = [
    'Setting up your TON wallet',
    'Connecting to Telegram',
    'Loading your agent',
    'Preparing workspace',
    'Ready',
  ]

  const sidebarItems: [LiveTab, string, boolean][] = [
    ['overview','Overview',true],
    ['marketplace','Marketplace',true],
    ['workspace','Workspace',true],
    ['activity','Activity',true],
    ['bots','Bots',true],
    ['credits','Credits',true],
    ['miniapps','Mini Apps',false],
    ['tonsites','TON Sites',false],
    ['subagents','Sub-agents',false],
  ]

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500;600&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       #FAF9F5;
      --bg2:      #F4F3EE;
      --surface:  #FFFFFF;
      --border:   #E5E5E0;
      --border2:  #D4D0C8;
      --blue:     #0098EA;
      --blue-d:   #007ec4;
      --blue-bg:  #EDF7FE;
      --text:     #1A1916;
      --text2:    #6B6760;
      --text3:    #A8A49C;
      --ok:       #16a34a;
      --ok-bg:    #f0fdf4;
      --ok-bdr:   #bbf7d0;
      --err:      #dc2626;
      --err-bg:   #fef2f2;
      --dark:     #141413;
      --r:        8px;
      --serif:    'DM Serif Display', Georgia, serif;
      --f:        'Inter', system-ui, sans-serif;
    }

    html, body, #root {
      height: 100%; background: var(--bg);
      color: var(--text); font-family: var(--f);
      -webkit-font-smoothing: antialiased;
    }

    @keyframes fadeup { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes f0 { 0%,100%{transform:translateY(0)}    50%{transform:translateY(-8px)} }
    @keyframes f1 { 0%,100%{transform:translateY(0)}    50%{transform:translateY(-11px)} }
    @keyframes f2 { 0%,100%{transform:translateY(0)}    50%{transform:translateY(-7px)} }
    @keyframes f3 { 0%,100%{transform:translateY(0)}    50%{transform:translateY(-10px)} }

    /* NAV */
    .nav {
      padding: 20px 56px;
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid var(--border); background: var(--bg);
      position: sticky; top: 0; z-index: 100;
    }
    .logo { font-size: 17px; font-weight: 600; letter-spacing: -0.3px; color: var(--text); }
    .logo em { font-style: normal; color: var(--blue); }
    .nav-r { display: flex; align-items: center; gap: 10px; }
    .nav-link {
      font-size: 14px; color: var(--text2); background: none;
      border: none; cursor: pointer; font-family: var(--f); padding: 6px 10px;
      border-radius: var(--r); transition: color 0.15s;
    }
    .nav-link:hover { color: var(--text); }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      font-family: var(--f); font-size: 14px; font-weight: 500;
      padding: 9px 20px; border-radius: var(--r);
      border: none; cursor: pointer; transition: all 0.15s;
      text-decoration: none;
    }
    .btn-dark  { background: var(--dark); color: #fff; }
    .btn-dark:hover  { background: #2a2a28; }
    .btn-dark:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-blue  { background: var(--blue); color: #fff; }
    .btn-blue:hover  { background: var(--blue-d); box-shadow: 0 4px 14px rgba(0,152,234,0.3); }
    .btn-blue:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
    .btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border2); }
    .btn-outline:hover { background: var(--bg2); }
    .btn-full { width: 100%; justify-content: center; }

    /* Mobile nav */
    .mobile-menu-btn {
      display: none;
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 8px;
      color: var(--text);
    }
    .mobile-nav-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.3);
      z-index: 199;
    }
    .mobile-nav-menu {
      display: none;
      position: fixed;
      top: 0; right: 0;
      width: 280px;
      height: 100vh;
      background: var(--surface);
      border-left: 1px solid var(--border);
      z-index: 200;
      padding: 20px;
      flex-direction: column;
      gap: 10px;
      animation: slideIn 0.2s ease;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    .mobile-nav-close {
      align-self: flex-end;
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: var(--text2);
      padding: 4px;
    }

    /* HERO */
    .hero {
      max-width: 1100px; margin: 0 auto;
      padding: 96px 56px 80px;
      display: grid; grid-template-columns: 1fr 420px;
      gap: 80px; align-items: center;
    }
    .hero-left { display: flex; flex-direction: column; gap: 0; }
    .hero-tag {
      display: inline-flex; align-items: center; gap: 7px;
      background: var(--blue-bg); color: var(--blue);
      font-size: 12px; font-weight: 500;
      padding: 4px 12px; border-radius: 100px;
      margin-bottom: 28px; width: fit-content;
    }
    .tag-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--blue); animation: blink 2s infinite; }
    .hero-h1 {
      font-family: var(--serif);
      font-size: clamp(40px, 5vw, 64px);
      font-weight: 400; line-height: 1.06;
      letter-spacing: -1px; color: var(--text);
      margin-bottom: 20px;
    }
    .hero-h1 em { font-style: italic; color: var(--blue); }
    .hero-p {
      font-size: 16px; color: var(--text2);
      line-height: 1.75; max-width: 480px; margin-bottom: 36px;
    }
    .hero-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

    /* HERO RIGHT — capability list */
    .hero-right {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 28px;
      display: flex; flex-direction: column; gap: 0;
    }
    .hero-right-title {
      font-size: 11px; font-weight: 500; text-transform: uppercase;
      letter-spacing: 0.8px; color: var(--text3); margin-bottom: 16px;
    }
    .cap-item {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 14px 0; border-bottom: 1px solid var(--border);
    }
    .cap-item:last-child { border-bottom: none; }
    .cap-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--blue); margin-top: 6px; flex-shrink: 0;
    }
    .cap-text { display: flex; flex-direction: column; gap: 2px; }
    .cap-title { font-size: 14px; font-weight: 500; color: var(--text); }
    .cap-desc  { font-size: 12px; color: var(--text2); line-height: 1.5; }

    /* AI LOGOS */
    .ai-section {
      border-top: 1px solid var(--border);
      padding: 48px 56px;
      display: flex; flex-direction: column; align-items: center; gap: 20px;
    }
    .ai-label { font-size: 12px; color: var(--text3); letter-spacing: 0.2px; }
    .ai-logos { display: flex; align-items: flex-end; gap: 32px; flex-wrap: wrap; justify-content: center; }
    .ai-logo-item { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .ai-logo-box {
      width: 48px; height: 48px; background: var(--surface);
      border: 1px solid var(--border); border-radius: 12px;
      display: flex; align-items: center; justify-content: center; padding: 10px;
    }
    .ai-logo-box img { width: 100%; height: 100%; object-fit: contain; }
    .ai-logo-item:nth-child(1) .ai-logo-box { animation: f0 3.2s ease-in-out infinite; }
    .ai-logo-item:nth-child(2) .ai-logo-box { animation: f1 2.8s ease-in-out infinite; }
    .ai-logo-item:nth-child(3) .ai-logo-box { animation: f2 3.5s ease-in-out infinite; }
    .ai-logo-item:nth-child(4) .ai-logo-box { animation: f3 3.0s ease-in-out infinite; }
    .ai-logo-name { font-size: 11px; color: var(--text3); }

    /* HOW IT WORKS */
    .how-section {
      background: var(--surface);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    .how-inner {
      max-width: 960px; margin: 0 auto;
      display: grid; grid-template-columns: 1fr 1fr 1fr;
    }
    .how-col {
      padding: 56px 44px;
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column; gap: 14px;
    }
    .how-col:last-child { border-right: none; }
    .how-num { font-size: 11px; font-weight: 600; color: var(--blue); letter-spacing: 1px; }
    .how-title {
      font-family: var(--serif);
      font-size: 22px; font-weight: 400;
      color: var(--text); line-height: 1.2;
    }
    .how-desc { font-size: 14px; color: var(--text2); line-height: 1.75; }

    /* COMING SECTION */
    .coming-section {
      max-width: 960px; margin: 0 auto;
      padding: 80px 56px;
    }
    .coming-section-label {
      font-size: 12px; font-weight: 500; text-transform: uppercase;
      letter-spacing: 1px; color: var(--text3); margin-bottom: 40px;
    }
    .coming-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
    }
    .coming-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; padding: 24px;
      display: flex; flex-direction: column; gap: 8px; opacity: 0.65;
    }
    .coming-card-title { font-size: 14px; font-weight: 500; color: var(--text); }
    .coming-card-desc  { font-size: 13px; color: var(--text2); line-height: 1.55; }
    .soon {
      display: inline-block; margin-top: 4px;
      font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;
      background: var(--bg2); border: 1px solid var(--border);
      color: var(--text3); padding: 2px 8px; border-radius: 100px; width: fit-content;
    }

    /* FOOTER */
    .footer {
      padding: 20px 56px; border-top: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      font-size: 13px; color: var(--text3);
    }

    /* AUTH */
    .auth-page {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 24px; background: var(--bg); animation: fadeup 0.4s ease;
    }
    .auth-card {
      width: 100%; max-width: 400px; background: var(--surface);
      border: 1px solid var(--border); border-radius: 12px; padding: 40px;
      box-shadow: 0 1px 3px rgba(26,25,22,0.04), 0 8px 24px rgba(26,25,22,0.06);
    }
    .auth-logo { font-size: 16px; font-weight: 600; letter-spacing: -0.3px; margin-bottom: 28px; }
    .auth-logo em { font-style: normal; color: var(--blue); }
    .auth-title {
      font-family: var(--serif); font-size: 26px; font-weight: 400;
      letter-spacing: -0.5px; margin-bottom: 6px; line-height: 1.15;
    }
    .auth-sub { font-size: 14px; color: var(--text2); line-height: 1.6; margin-bottom: 28px; }
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .field-lbl { font-size: 13px; font-weight: 500; color: var(--text); }
    .field-inp {
      width: 100%; background: var(--bg); border: 1px solid var(--border2);
      border-radius: var(--r); color: var(--text); font-family: var(--f);
      font-size: 15px; padding: 11px 14px; outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .field-inp:focus {
      border-color: var(--blue); background: var(--surface);
      box-shadow: 0 0 0 3px rgba(0,152,234,0.1);
    }
    .field-inp::placeholder { color: var(--text3); }
    .back-btn {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 13px; color: var(--text2); font-family: var(--f);
      background: none; border: none; cursor: pointer; padding: 0;
      margin-bottom: 20px; transition: color 0.15s;
    }
    .back-btn:hover { color: var(--text); }
    .err {
      background: var(--err-bg); border: 1px solid #fecaca;
      border-radius: var(--r); padding: 11px 14px;
      font-size: 13px; color: var(--err); margin-top: 12px; line-height: 1.5;
    }
    .hint { font-size: 13px; color: var(--text3); margin-top: 10px; line-height: 1.5; }

    /* PROV */
    .prov-list { margin: 24px 0; }
    .prov-row {
      display: flex; align-items: center; gap: 14px;
      padding: 13px 0; border-bottom: 1px solid var(--border);
      font-size: 14px; color: var(--text3); transition: color 0.4s;
    }
    .prov-row:last-child { border-bottom: none; }
    .prov-row.done   { color: var(--ok); }
    .prov-row.active { color: var(--text); font-weight: 500; }
    .prov-ic { width: 16px; text-align: center; font-size: 12px; }

    /* LIVE DASHBOARD */
    .live { 
      min-height: 100vh; 
      background: var(--bg); 
      display: grid;
      grid-template-rows: 56px 1fr;
      grid-template-columns: 200px 1fr;
      animation: fadeup 0.4s ease;
    }
    
    /* Topbar */
    .live-topbar {
      grid-column: 1 / -1;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .live-topbar-r {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--ok-bg);
      border: 1px solid var(--ok-bdr);
      color: var(--ok);
      font-size: 12px;
      font-weight: 500;
      padding: 4px 12px;
      border-radius: 100px;
    }
    .status-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--ok);
      animation: blink 2s infinite;
    }
    .wallet-nav {
      font-size: 13px;
      font-weight: 500;
      color: var(--blue);
      background: var(--blue-bg);
      border: 1px solid rgba(0,152,234,0.2);
      padding: 7px 16px;
      border-radius: var(--r);
      cursor: not-allowed;
      opacity: 0.7;
      user-select: none;
      font-family: var(--f);
    }
    .tg-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--blue);
      color: #fff;
      font-family: var(--f);
      font-size: 13px;
      font-weight: 500;
      padding: 8px 18px;
      border-radius: var(--r);
      text-decoration: none;
      transition: background 0.15s;
    }
    .tg-btn:hover { background: var(--blue-d); }
    .disc-btn {
      font-family: var(--f);
      font-size: 13px;
      color: var(--text3);
      background: none;
      border: none;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: var(--r);
      transition: all 0.15s;
    }
    .disc-btn:hover { color: var(--err); background: var(--err-bg); }

    /* Mobile topbar toggle */
    .sidebar-toggle {
      display: none;
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 8px;
      color: var(--text);
      margin-right: 10px;
    }

    /* Sidebar */
    .sidebar {
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 20px 0;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .sb-lbl { display: none; }
    .sb-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 20px;
      font-size: 13px;
      color: var(--text2);
      cursor: pointer;
      transition: all 0.15s;
      border-left: 2px solid transparent;
    }
    .sb-item:hover {
      color: var(--text);
      background: var(--bg);
    }
    .sb-item.active {
      color: var(--blue);
      border-left-color: var(--blue);
      background: var(--blue-bg);
    }
    .sb-item.locked {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .sb-item.locked:hover {
      color: var(--text2);
      background: transparent;
    }
    .sb-soon {
      font-size: 10px;
      background: var(--bg2);
      border: 1px solid var(--border);
      color: var(--text3);
      padding: 1px 7px;
      border-radius: 100px;
    }

    /* Mobile sidebar overlay */
    .sidebar-overlay {
      display: none;
      position: fixed;
      top: 56px;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.3);
      z-index: 90;
    }

    /* Main content */
    .main {
      overflow-y: auto;
      min-height: 0;
    }
    .main-body {
      max-width: 560px;
      padding: 48px 32px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .live-greeting {
      font-family: var(--serif);
      font-size: 30px;
      font-weight: 400;
      letter-spacing: -0.5px;
      margin-bottom: 2px;
      line-height: 1.15;
    }
    .live-tagline {
      font-size: 15px;
      color: var(--text2);
      margin-bottom: 8px;
    }
    .info-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 24px;
    }
    .info-label {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text3);
      margin-bottom: 10px;
    }
    .wallet-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
    }
    .wallet-addr {
      font-size: 13px;
      color: var(--text2);
      word-break: break-all;
      line-height: 1.6;
      flex: 1;
    }
    .copy-btn {
      flex-shrink: 0;
      font-family: var(--f);
      font-size: 12px;
      font-weight: 500;
      background: var(--bg);
      border: 1px solid var(--border2);
      border-radius: 6px;
      color: var(--text2);
      padding: 6px 14px;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .copy-btn:hover { color: var(--text); }
    .copy-btn.ok {
      color: var(--ok);
      border-color: var(--ok-bdr);
      background: var(--ok-bg);
    }
    .how-text {
      font-size: 14px;
      color: var(--text2);
      line-height: 1.8;
    }

    /* Provider grid */
    .provider-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .prov-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .prov-card:hover { border-color: var(--border2); }
    .prov-card.active {
      border-color: var(--blue);
      background: var(--blue-bg);
    }
    .prov-card.locked {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .prov-img {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      background: var(--surface);
      flex-shrink: 0;
    }
    .prov-img img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .prov-name {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 1px;
    }
    .prov-sub {
      font-size: 11px;
      color: var(--text3);
    }
    .prov-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--blue);
      margin-left: auto;
      flex-shrink: 0;
    }
    .prov-soon {
      font-size: 10px;
      background: var(--bg2);
      border: 1px solid var(--border);
      color: var(--text3);
      padding: 1px 7px;
      border-radius: 100px;
      margin-left: auto;
    }

    /* Workspace */
    .workspace-container {
      display: grid;
      grid-template-columns: 200px 1fr;
      height: calc(100vh - 56px);
      overflow: hidden;
    }
    .mobile-files-toggle {
      display: none;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      font-family: var(--f);
      font-size: 13px;
      color: var(--text);
      border: none;
      cursor: pointer;
      width: 100%;
    }
    .mobile-files-toggle .active-file-name {
      font-size: 12px;
      color: var(--text3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 200px;
    }
    .ws-files {
      background: var(--surface);
      border-right: 1px solid var(--border);
      padding: 16px 0;
      overflow-y: auto;
    }
    .ws-file-item {
      padding: 10px 16px;
      font-size: 13px;
      color: var(--text2);
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .ws-file-item:hover {
      color: var(--text);
      background: var(--bg);
    }
    .ws-file-item.active {
      color: var(--blue);
      background: var(--blue-bg);
    }
    .ws-lock {
      font-size: 10px;
      color: var(--text3);
    }
    .ws-editor {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .ws-editor-head {
      padding: 12px 20px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .ws-file-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text);
    }
    .ws-locked-note {
      font-size: 11px;
      color: var(--text3);
      background: var(--bg2);
      border: 1px solid var(--border);
      padding: 3px 10px;
      border-radius: 100px;
    }
    .ws-save-btn {
      font-family: var(--f);
      font-size: 12px;
      font-weight: 500;
      background: var(--blue);
      color: #fff;
      border: none;
      padding: 6px 16px;
      border-radius: 6px;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .ws-save-btn:hover { opacity: 0.85; }
    .ws-save-btn.saved { background: var(--ok); }
    .ws-refresh-btn {
      font-family: var(--f);
      font-size: 12px;
      color: var(--text2);
      background: var(--bg);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .ws-textarea {
      flex: 1;
      background: var(--bg);
      border: none;
      outline: none;
      color: var(--text);
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px;
      line-height: 1.7;
      padding: 20px;
      resize: none;
      min-height: 0;
      width: 100%;
    }
    .ws-empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 8px;
      color: var(--text3);
      font-size: 13px;
    }
    .mobile-files-overlay {
      display: none;
      position: fixed;
      top: 56px;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.3);
      z-index: 80;
    }

    /* Tab content */
    .tab-content {
      padding: 32px;
      max-width: 640px;
    }
    .tab-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .tab-title {
      font-family: var(--serif);
      font-size: 22px;
      font-weight: 400;
    }
    .bots-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .bot-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 20px;
    }
    .bot-card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .bot-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }
    .bot-btn-logs {
      font-family: var(--f);
      font-size: 12px;
      color: var(--blue);
      background: var(--blue-bg);
      border: 1px solid var(--border);
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .bot-btn-stop {
      font-family: var(--f);
      font-size: 12px;
      color: var(--err);
      background: var(--err-bg);
      border: 1px solid #fecaca;
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .bot-logs {
      background: #02020a;
      color: #7dff9e;
      padding: 14px;
      border-radius: 8px;
      font-size: 11px;
      line-height: 1.6;
      overflow: auto;
      max-height: 200px;
      white-space: pre-wrap;
      word-break: break-all;
      margin-top: 12px;
    }
    .bots-empty {
      color: var(--text2);
      font-size: 14px;
      line-height: 1.7;
      padding: 32px 0;
    }
    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .activity-item {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .activity-tool {
      font-size: 11px;
      background: var(--bg2);
      border: 1px solid var(--border);
      color: var(--text2);
      padding: 2px 8px;
      border-radius: 100px;
    }
    .activity-empty {
      font-size: 14px;
      color: var(--text2);
      padding: 48px 0;
      text-align: center;
    }

    /* Live coming grid */
    .live-coming-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .live-coming-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      opacity: 0.55;
    }
    .lcc-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
    }
    .lcc-desc {
      font-size: 13px;
      color: var(--text2);
      line-height: 1.55;
    }

    /* Pricing */
    .pricing-page {
      min-height: 100vh;
      background: var(--bg);
      animation: fadeup 0.4s ease;
      padding: 64px 24px;
    }
    .pricing-inner {
      max-width: 860px;
      margin: 0 auto;
    }
    .pricing-head {
      text-align: center;
      margin-bottom: 48px;
    }
    .pricing-title {
      font-family: var(--serif);
      font-size: 40px;
      font-weight: 400;
      letter-spacing: -0.5px;
      margin-bottom: 10px;
    }
    .pricing-sub {
      font-size: 15px;
      color: var(--text2);
      line-height: 1.6;
      max-width: 480px;
      margin: 0 auto;
    }
    .plans-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .plan-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 28px;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .plan-card.highlight {
      border-color: var(--blue);
      box-shadow: 0 0 0 1px var(--blue);
    }
    .plan-badge {
      position: absolute;
      top: -1px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--blue);
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      padding: 3px 12px;
      border-radius: 0 0 8px 8px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .plan-name {
      font-size: 11px;
      font-weight: 500;
      color: var(--text3);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .plan-price {
      font-family: var(--serif);
      font-size: 36px;
      font-weight: 400;
      letter-spacing: -0.5px;
    }
    .plan-period {
      font-size: 13px;
      color: var(--text3);
      margin-bottom: 16px;
    }
    .plan-note {
      font-size: 12px;
      color: var(--text3);
      line-height: 1.6;
      margin-bottom: 16px;
      padding: 10px 12px;
      background: var(--bg2);
      border-radius: 6px;
      border-left: 2px solid var(--border2);
    }
    .plan-features {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
      flex: 1;
    }
    .plan-feat {
      font-size: 13px;
      color: var(--text2);
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .plan-check {
      color: var(--ok);
      flex-shrink: 0;
    }
    .plan-cta {
      width: 100%;
      justify-content: center;
      margin-top: 20px;
      display: flex;
      padding: 11px 22px;
      border-radius: 8px;
      border: none;
      font-family: var(--f);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      background: var(--dark);
      color: #fff;
    }
    .plan-cta.soon {
      background: var(--bg2);
      color: var(--text3);
      cursor: not-allowed;
      border: 1px solid var(--border);
    }

    /* Bottom nav for mobile */
    .bottom-nav {
      display: none;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--surface);
      border-top: 1px solid var(--border);
      padding: 8px 0;
      z-index: 100;
    }
    .bottom-nav-items {
      display: flex;
      justify-content: space-around;
      align-items: center;
    }
    .bottom-nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 4px 8px;
      font-size: 10px;
      color: var(--text3);
      background: none;
      border: none;
      cursor: pointer;
      transition: color 0.15s;
    }
    .bottom-nav-item.active {
      color: var(--blue);
    }
    .bottom-nav-item svg {
      width: 20px;
      height: 20px;
    }

    /* ==================== RESPONSIVE STYLES ==================== */

    /* Tablet breakpoint */
    @media (max-width: 900px) {
      .hero {
        grid-template-columns: 1fr;
        gap: 48px;
        padding: 64px 24px;
      }
      .hero-right { display: none; }
      .how-inner { grid-template-columns: 1fr; }
      .how-col {
        border-right: none;
        border-bottom: 1px solid var(--border);
        padding: 36px 24px;
      }
      .how-col:last-child { border-bottom: none; }
      .coming-grid { grid-template-columns: 1fr 1fr; }
      .nav, .footer, .ai-section, .coming-section {
        padding-left: 24px;
        padding-right: 24px;
      }
      
      /* Live dashboard tablet */
      .live {
        grid-template-columns: 180px 1fr;
      }
      .live-topbar {
        padding: 0 16px;
      }
      .main-body {
        padding: 32px 20px;
      }
      .workspace-container {
        grid-template-columns: 180px 1fr;
      }
      .tab-content {
        padding: 24px 20px;
      }
    }

    /* Mobile breakpoint */
    .hamburger { display: none; }
    @media (max-width: 768px) {
      .hamburger { display: flex !important; }
      /* Navigation */
      .nav-r {
        display: none;
      }
      .mobile-menu-btn {
        display: block;
      }
      .mobile-nav-overlay {
        display: block;
      }
      .mobile-nav-menu {
        display: flex;
      }

      /* Hero */
      .hero-h1 {
        font-size: clamp(32px, 8vw, 48px);
      }
      .hero-actions {
        flex-direction: column;
        align-items: stretch;
      }
      .hero-actions .btn {
        width: 100%;
        justify-content: center;
      }

      /* AI logos */
      .ai-logos {
        gap: 20px;
      }
      .ai-logo-box {
        width: 40px;
        height: 40px;
      }

      /* Coming grid */
      .coming-grid {
        grid-template-columns: 1fr;
      }
      .live-coming-grid {
        grid-template-columns: 1fr;
      }

      /* Footer */
      .footer {
        flex-direction: column;
        gap: 8px;
        text-align: center;
        padding: 16px 24px;
      }

      /* Auth card */
      .auth-card {
        padding: 28px 20px;
        margin: 0 10px;
      }

      /* ==================== LIVE DASHBOARD MOBILE ==================== */
      .live {
        display: flex;
        flex-direction: column;
        padding-bottom: 0;
      }
      .live .main:not(:has(.workspace-container)) {
        padding-bottom: 64px;
      }

      /* Topbar mobile */
      .live-topbar {
        padding: 0 12px;
        flex-wrap: wrap;
        height: auto;
        min-height: 56px;
        gap: 8px;
        padding-top: 8px;
        padding-bottom: 8px;
      }
      .live-topbar-r {
        flex-wrap: nowrap;
        justify-content: flex-end;
        gap: 4px;
      }
      .live-topbar-r .tg-btn { display: none; }
      .live-topbar-r .disc-btn { display: none; }
      .live-topbar-r > div[style*="credits"] { display: none; }
      .status-badge { font-size: 10px; padding: 2px 6px; }
      .sidebar-toggle {
        display: block;
      }

      /* Sidebar - hidden by default on mobile, slide in when open */
      .sidebar {
        position: fixed;
        top: 0; left: 0;
        width: 75%; max-width: 300px;
        height: 100vh;
        z-index: 200;
        transform: translateX(-100%);
        transition: transform 0.25s ease;
        padding-top: 20px;
        box-shadow: 4px 0 24px rgba(0,0,0,0.12);
      }
      .sidebar.mobile-open { transform: translateX(0); }
      .sidebar-overlay {
        display: block;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.4);
        z-index: 199;
      }

      /* Main content - full width */
      .main {
        width: 100%;
      }
      .main-body {
        max-width: 100%;
        padding: 20px 16px;
      }
      .live-greeting {
        font-size: 24px;
      }
      .live-tagline {
        font-size: 14px;
      }

      /* Info cards */
      .info-card {
        padding: 16px;
      }

      /* Status grid in overview */
      .info-card > div:first-child {
        grid-template-columns: 1fr !important;
        margin: -12px -12px 16px !important;
      }
      .info-card > div:first-child > div {
        border-right: none !important;
        border-bottom: 1px solid var(--border);
        padding: 12px 16px !important;
      }
      .info-card > div:first-child > div:last-child {
        border-bottom: none !important;
      }

      /* Provider grid - single column */
      .provider-grid {
        grid-template-columns: 1fr;
      }
      .prov-card {
        padding: 12px;
      }

      /* Wallet row */
      .wallet-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }
      .copy-btn {
        align-self: flex-start;
      }

      /* Workspace mobile */
      .workspace-container {
        grid-template-columns: 1fr;
        position: relative;
        height: calc(100dvh - 56px - 64px);
        display: flex;
        flex-direction: column;
      }
      .ws-editor {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .ws-textarea {
        flex: 1;
        min-height: 150px;
      }
      .mobile-files-toggle {
        display: flex;
      }
      .ws-files {
        position: fixed;
        top: 56px;
        left: 0;
        width: 260px;
        height: calc(100dvh - 56px - 64px);
        z-index: 85;
        transform: translateX(-100%);
        transition: transform 0.25s ease;
      }
      .ws-files.mobile-open {
        transform: translateX(0);
      }
      .mobile-files-overlay {
        display: block;
      }
      .ws-editor-head {
        padding: 10px 14px;
      }
      .ws-textarea {
        padding: 14px;
        font-size: 14px;
      }

      /* Tab content */
      .tab-content {
        padding: 16px;
        max-width: 100%;
      }
      .tab-header {
        flex-wrap: wrap;
        gap: 10px;
      }
      .tab-title {
        font-size: 20px;
      }

      /* Bot cards */
      .bot-card {
        padding: 14px;
      }
      .bot-card-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }
      .bot-actions {
        margin-left: 0;
        width: 100%;
        justify-content: flex-end;
      }

      /* Activity items */
      .activity-item {
        padding: 14px;
      }

      /* Pricing - single column */
      .plans-grid {
        grid-template-columns: 1fr;
      }
      .plan-card {
        padding: 24px 20px;
      }
      .pricing-title {
        font-size: 32px;
      }

      /* Bottom nav */
      .bottom-nav {
        display: block;
      }
    }

    /* Small mobile breakpoint */
    @media (max-width: 480px) {
      .hero {
        padding: 48px 16px;
      }
      .hero-h1 {
        font-size: 28px;
      }
      .hero-p {
        font-size: 15px;
      }
      
      .nav, .footer, .ai-section, .coming-section {
        padding-left: 16px;
        padding-right: 16px;
      }

      /* Live dashboard */
      .live-topbar-r {
        width: 100%;
        justify-content: flex-start;
        order: 3;
      }
      .live-topbar .logo {
        order: 1;
      }
      .live-topbar .sidebar-toggle {
        order: 2;
        margin-left: auto;
      }

      .main-body {
        padding: 16px 12px;
      }

      .how-text {
        font-size: 13px;
      }

      /* Bottom nav - more compact */
      .bottom-nav-item {
        font-size: 9px;
        padding: 4px 6px;
      }
      .bottom-nav-item svg {
        width: 18px;
        height: 18px;
      }
    }

    /* Landscape mode on mobile */
    @media (max-height: 500px) and (orientation: landscape) {
      .bottom-nav {
        display: none;
      }
      .live {
        padding-bottom: 0;
      }
    }

    @media (max-width: 480px) {
      .coming-grid { grid-template-columns: 1fr; }
      .live-greeting { font-size: 22px !important; }
      .hero-h1 { font-size: 32px; }
      .auth-card { padding: 20px 14px; }
      .live-topbar-r .status-badge span { display: none; }
    }

  `

  const renderBottomNav = () => (
    <nav className="bottom-nav">
      <div className="bottom-nav-items">
        {sidebarItems.slice(0, 4).map(([id, label]) => (
          <button
            key={id}
            className={`bottom-nav-item ${liveTab === id ? 'active' : ''}`}
            onClick={() => setLiveTab(id)}
          >
            {id === 'overview' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
              </svg>
            )}
            {id === 'workspace' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            )}
            {id === 'activity' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            )}
            {id === 'marketplace' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            )}
            {id === 'bots' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            )}
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )

  return (
    <>
      <style>{css}</style>

      {/* Mobile Navigation Overlay */}
      {mobileMenuOpen && (
        <>
          <div className="mobile-nav-overlay" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-nav-menu">
            <button className="mobile-nav-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
            <button className="nav-link" style={{fontSize:16,padding:'12px 0'}} onClick={async () => {
              setMobileMenuOpen(false)
              const saved = localStorage.getItem('agentr_tenant')
              if (saved) {
                try {
                  const a = JSON.parse(saved)
                  const d = await apiGet('/agent/status/' + a.tenantId)
                  if (d.status === 'online') { setAgent(a); setProvider(a.provider ?? 'codex'); setScreen('live'); return }
                } catch {}
              }
              const savedId = localStorage.getItem('agentr_tenantId')
              const savedPhone = localStorage.getItem('agentr_phone')
              if (savedId) {
                try {
                  const d = await apiGet('/agent/status/' + savedId)
                  if (d.status === 'online') {
                    const r = { tenantId: savedId, phone: savedPhone ?? '', phoneCodeHash: '', username: d.telegram?.username, firstName: d.telegram?.firstName, walletAddress: d.walletAddress, provider: 'codex' }
                    setAgent(r); localStorage.setItem('agentr_tenant', JSON.stringify(r)); setProvider('codex'); setScreen('live'); return
                  }
                } catch {}
              }
                            setScreen('phone')
            }}>Sign in</button>
            <button className="btn btn-blue" style={{justifyContent:'center'}} onClick={() => { setMobileMenuOpen(false); setScreen('phone') }}>
              Get started
            </button>
          </div>
        </>
      )}

      {screen === 'landing' && (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', animation: 'fadeup 0.5s ease' }}>
          <nav className="nav">
            <div className="logo">AGENT<em>R</em></div>
            <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)}>☰</button>
            <div className="nav-r">
              <button className="nav-link" onClick={async () => {
                const saved = localStorage.getItem('agentr_tenant')
                if (saved) {
                  try {
                    const a = JSON.parse(saved)
                    const d = await apiGet('/agent/status/' + a.tenantId)
                    if (d.status === 'online') { setAgent(a); setProvider(a.provider ?? 'codex'); setScreen('live'); return }
                  } catch {}
                }
                setScreen('phone')
              }}>Sign in</button>
              <TonConnectButton />
              <button className="btn btn-dark" onClick={() => setScreen('phone')}>Get started</button>
            </div>
          </nav>

          <div className="hero">
            <div className="hero-left">
              <div className="hero-tag">
                <div className="tag-dot" />
                AI Agent Factory on TON
              </div>
              <h1 className="hero-h1">
                Build your entire<br />
                TON ecosystem,<br />
                <em>through conversation.</em>
              </h1>
              <p className="hero-p">
                One master AI agent that lives on your Telegram. It builds bots, 
                deploys mini apps, creates TON websites, spawns sub-agents, 
                and manages payments — all through plain English. No code required.
              </p>
              <div className="hero-actions">
                <button className="btn btn-dark" onClick={() => setScreen('phone')}>Launch your agent</button>
                <button className="btn btn-outline" onClick={async () => {
                  const saved = localStorage.getItem('agentr_tenant')
                  if (saved) {
                    try {
                      const a = JSON.parse(saved)
                      const d = await apiGet('/agent/status/' + a.tenantId)
                      if (d.status === 'online') { setAgent(a); setProvider(a.provider ?? 'codex'); setScreen('live'); return }
                    } catch {}
                  }
                  setScreen('phone')
                }}>Sign in</button>
                <a href="https://github.com/daraijaola/agentr" target="_blank" rel="noreferrer"
                  className="btn btn-outline"
                  style={{display:'inline-flex',alignItems:'center',gap:6,textDecoration:'none'}}>
                  <img src="/github.png" alt="GitHub" style={{width:15,height:15,objectFit:'contain'}} /> GitHub
                </a>
              </div>
            </div>

            <div className="hero-right">
              <div className="hero-right-title">What your agent can build</div>
              {[
                { title: 'Telegram Bots',      desc: 'Full bots with commands, inline keyboards, and logic — deployed in seconds.' },
                { title: 'Mini Apps',          desc: 'Web apps that live inside Telegram, built and launched autonomously.' },
                { title: 'TON Websites',       desc: 'Decentralized sites on TON Storage, accessible via TON DNS.' },
                { title: 'Sub-agents',         desc: 'Specialized agents spawned for specific tasks, working under your master agent.' },
                { title: 'Payment Flows',      desc: 'TON payment gates, transaction monitoring, and wallet operations.' },
                { title: 'TON DNS Domains',    desc: 'Register and manage .ton domains directly from conversation.' },
              ].map(c => (
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
              {[
                { src: '/claude.webp',   name: 'Claude' },
                { src: '/openai.webp',   name: 'OpenAI' },
                { src: '/gemini.webp',   name: 'Gemini' },
                { src: '/kimi.webp',     name: 'Kimi' },
              ].map(ai => (
                <div className="ai-logo-item" key={ai.name}>
                  <div className="ai-logo-box"><img src={ai.src} alt={ai.name} /></div>
                  <span className="ai-logo-name">{ai.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="how-section">
            <div className="how-inner">
              <div className="how-col">
                <div className="how-num">01</div>
                <div className="how-title">Connect your Telegram</div>
                <div className="how-desc">Sign in with your phone number. Your master agent activates on your Telegram account and starts listening immediately.</div>
              </div>
              <div className="how-col">
                <div className="how-num">02</div>
                <div className="how-title">Describe what you want</div>
                <div className="how-desc">Tell your agent what to build in plain English. A payment bot. A mini app. A TON website. A sub-agent for customer support. Anything.</div>
              </div>
              <div className="how-col">
                <div className="how-num">03</div>
                <div className="how-title">Your ecosystem builds itself</div>
                <div className="how-desc">The agent writes code, deploys it, manages processes, handles TON payments, and reports back — all without you touching a terminal.</div>
              </div>
            </div>
          </div>

          <div className="coming-section">
            <div className="coming-section-label">On the roadmap</div>
            <div className="coming-grid">
              {[
                { title: 'Swarm mode',  desc: 'Deploy dozens of sub-agents in parallel. Each handling a different task simultaneously.' },
                { title: 'TON Hosting', desc: 'Native decentralized hosting via TON Storage and Cocoon infrastructure.' },
              ].map(item => (
                <div key={item.title} className="coming-card">
                  <div className="coming-card-title">{item.title}</div>
                  <div className="coming-card-desc">{item.desc}</div>
                  <span className="soon">Coming soon</span>
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

      {screen === 'phone' && (
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-logo">AGENT<em>R</em></div>
            <button className="back-btn" onClick={() => { setScreen('landing'); setError('') }}>← Back</button>
            <div className="auth-title">Connect Telegram</div>
            <div className="auth-sub">Enter your phone number to activate your personal agent.</div>
            <div className="field">
              <label className="field-lbl">Phone number</label>
              <input className="field-inp" type="tel" placeholder="+1 234 567 8900"
                value={phone} onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePhone()} autoFocus />
            </div>
            <button className="btn btn-dark btn-full" onClick={handlePhone} disabled={loading || !phone.trim()}>
              {loading ? 'Sending…' : 'Send code'}
            </button>
            {error && <div className="err">{error}</div>}
            <p className="hint">We'll send a verification code to your Telegram app.</p>
          </div>
        </div>
      )}

      {screen === 'setup' && (
        <div className="auth-page">
          <div className="auth-card" style={{maxWidth:460}}>
            <div className="auth-logo">AGENT<em>R</em></div>
            <div className="auth-title">Set up your agent</div>
            <div className="field">
              <div className="field-lbl">What should your agent call you?</div>
              <input className="field-inp" placeholder="e.g. Mike, Boss, Alex" maxLength={32}
                value={setupData.ownerName}
                onChange={e => setSetupData(p => ({...p, ownerName: e.target.value}))} />
              <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>Your agent will address you by this name in every conversation.</div>
            </div>

            <div className="field">
              <div className="field-lbl">Your main Telegram username <span style={{color:'var(--text3)',fontWeight:400}}>(for Manual mode)</span></div>
              <input className="field-inp" placeholder="@username" maxLength={64}
                value={setupData.ownerUsername}
                onChange={e => setSetupData(p => ({...p, ownerUsername: e.target.value}))} />
              <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>Only needed if you select Manual only below. This is your personal account username.</div>
            </div>

            <div className="field">
              <div className="field-lbl">Give your agent a name <span style={{color:'var(--text3)',fontWeight:400}}>(optional)</span></div>
              <input className="field-inp" placeholder="e.g. Nova, Rex, Axiom" maxLength={32}
                value={setupData.agentName}
                onChange={e => setSetupData(p => ({...p, agentName: e.target.value}))} />
              <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>What your agent calls itself. Leave blank to skip.</div>
            </div>

            <div className="field">
              <div className="field-lbl">Who can trigger your agent?</div>
              <div style={{fontSize:12,color:'var(--text3)',marginTop:2,marginBottom:8}}>Your agent runs on a sub-account. This controls who activates it by DMing that account.</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {[
                  {id:'everyone', label:'Everyone',      desc:'Any incoming DM triggers the agent'},
                  {id:'contacts', label:'Contacts only', desc:'Only people saved in your contacts'},
                  {id:'manual',   label:'Manual only',   desc:'Only activates when you message it yourself'},
                ].map(opt => (
                  <div key={opt.id}
                    onClick={() => setSetupData(p => ({...p, dmPolicy: opt.id}))}
                    style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 14px',borderRadius:8,border:`1px solid ${setupData.dmPolicy===opt.id?'var(--blue)':'var(--border)'}`,background:setupData.dmPolicy===opt.id?'var(--blue-bg)':'var(--surface)',cursor:'pointer',transition:'all .15s'}}>
                    <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${setupData.dmPolicy===opt.id?'var(--blue)':'var(--border2)'}`,background:setupData.dmPolicy===opt.id?'var(--blue)':'transparent',flexShrink:0,marginTop:2,transition:'all .15s'}} />
                    <div>
                      <div style={{fontSize:14,fontWeight:500,color:'var(--text)'}}>{opt.label}</div>
                      <div style={{fontSize:12,color:'var(--text3)',marginTop:1}}>{opt.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button className="btn btn-dark btn-full" style={{marginTop:8}}
              onClick={async () => {
                if (agent) {
                  try {
                    await post('/agent/setup', {
                      tenantId: agent.tenantId,
                      agentName: setupData.agentName,
                      dmPolicy: setupData.dmPolicy,
                      ownerUsername: setupData.ownerUsername,
                      ownerName: setupData.ownerName,
                    })
                  } catch {}
                }
                setScreen('otp')
              }}>
              Continue
            </button>
            <button className="back-btn" style={{marginTop:12,width:'100%',justifyContent:'center'}}
              onClick={() => setScreen('phone')}>← Back</button>
          </div>
        </div>
      )}

      {screen === 'otp' && (
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-logo">AGENT<em>R</em></div>
            <button className="back-btn" onClick={() => { setScreen('phone'); setError('') }}>← Back</button>
            <div className="auth-title">Check Telegram</div>
            <div className="auth-sub">Enter the code sent to {agent?.phone}.</div>
            <div className="field">
              <label className="field-lbl">Verification code</label>
              <input className="field-inp" type="text" placeholder="12345" maxLength={5}
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleOtp()} autoFocus />
            </div>
            <button className="btn btn-dark btn-full" onClick={handleOtp} disabled={loading || otp.length !== 5}>
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
            {error && <div className="err">{error}</div>}
          </div>
        </div>
      )}

      {screen === 'twofa' && (
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-logo">AGENT<em>R</em></div>
            <div className="auth-title">Two-step verification</div>
            <div className="auth-sub">Enter your Telegram cloud password to continue.</div>
            <div className="field">
              <label className="field-lbl">Password</label>
              <input className="field-inp" type="password" placeholder="Your password"
                value={twofa} onChange={e => setTwofa(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handle2FA()} autoFocus />
            </div>
            <button className="btn btn-dark btn-full" onClick={handle2FA} disabled={loading || !twofa.trim()}>
              {loading ? 'Checking…' : 'Continue'}
            </button>
            {error && <div className="err">{error}</div>}
          </div>
        </div>
      )}

      {screen === 'pricing' && (
        <div className="pricing-page">
          <div className="pricing-inner" >
            <div style={{marginBottom:24}}><button className="back-btn" onClick={() => setScreen('otp')}>← Back</button></div>
            <div className="pricing-head">
              <div className="pricing-title">Choose your plan</div>
              {tonWallet ? (
                <div style={{display:'inline-flex',alignItems:'center',gap:8,background:'var(--ok-bg)',border:'1px solid var(--ok-bdr)',borderRadius:100,padding:'6px 14px',fontSize:13,color:'var(--ok)',margin:'12px auto 0',fontWeight:500}}>
                  <div style={{width:7,height:7,borderRadius:'50%',background:'var(--ok)'}} />
                  Wallet connected — {tonAddress.slice(0,6)}...{tonAddress.slice(-4)}
                </div>
              ) : (
                <div style={{display:'inline-flex',alignItems:'center',gap:8,background:'var(--blue)',borderRadius:100,padding:'8px 20px',fontSize:13,fontWeight:500,color:'#fff',margin:'12px auto 0',cursor:'pointer'}} onClick={()=>tonConnectUI.openModal()}>
                  Connect wallet to subscribe
                </div>
              )}
              <div className="pricing-sub">Start free for 24 hours, upgrade when ready. Your agent stays hosted even when credits run out.</div>
            </div>
            <div className="plans-grid" >
              {[
                {id:'free',name:'Free Trial',price:'Free',period:'1 day',highlight:false,cta:'Start free',note:'ChatGPT Codex only. No credit card.',features:['24hr access','ChatGPT Codex model','Basic agent capabilities']},
                {id:'starter',name:'Starter',price:'$15',period:'mo',highlight:false,cta:'Subscribe',note:'',features:['7,500 credits/mo','All models','Bots & mini apps','TON payments','Cocoon hosting']},
                {id:'pro',name:'Pro',price:'$29',period:'mo',highlight:true,cta:'Subscribe',note:'',features:['20,000 credits/mo','All models','Sub-agents (soon)','TON Sites & DNS','Marketplace']},
                {id:'elite',name:'Elite',price:'$49',period:'mo',highlight:false,cta:'Subscribe',note:'',features:['40,000 credits/mo','All models priority','Swarm mode','Publish agents & earn 75%','Dedicated support']},
              ].map(plan => (
                <div key={plan.id} className={`plan-card${plan.highlight?' highlight':''}`}>
                  {plan.highlight && <div className="plan-badge">Popular</div>}
                  <div className="plan-name">{plan.name}</div>
                  <div className="plan-price">{plan.price}</div>
                  <div className="plan-period">/ {plan.period}</div>
                  {plan.note && <div className="plan-note">{plan.note}</div>}
                  <div className="plan-features">
                    {plan.features.map(f => <div key={f} className="plan-feat"><span className="plan-check">✓</span>{f}</div>)}
                  </div>
                  <button
                    style={plan.id==='free'
                      ? {width:'100%',padding:'11px 22px',borderRadius:8,border:'none',background:'#141413',color:'#fff',fontFamily:'var(--f)',fontSize:14,fontWeight:500,cursor:'pointer',marginTop:20}
                      : {width:'100%',padding:'11px 22px',borderRadius:8,border:'none',background:'var(--blue)',color:'#fff',fontFamily:'var(--f)',fontSize:14,fontWeight:500,cursor:'pointer',marginTop:20}}
                    onClick={()=>{
                      if(plan.id==='free') handlePlan(plan.id)
                      else if(plan.id==='starter') handleSubscribe('starter', 15)
                      else if(plan.id==='pro') handleSubscribe('pro', 29)
                      else if(plan.id==='elite') handleSubscribe('elite', 49)
                    }}
                  >{plan.id==='free' ? plan.cta : (tonWallet ? 'Pay with TON' : 'Subscribe')}</button>
                </div>
              ))}
            </div>
            <div style={{textAlign:'center',fontSize:13,color:'var(--text3)'}}>Credits are consumed per action. Agent stays hosted even when credits are empty.</div>
          </div>
        </div>
      )}

      {screen === 'provisioning' && (
        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-logo">AGENT<em>R</em></div>
            <div className="auth-title">Setting things up</div>
            <div className="auth-sub">Give us a moment — we're getting your agent ready.</div>
            <div className="prov-list">
              {STEPS.map((s, i) => (
                <div key={i} className={`prov-row ${i < provStep ? 'done' : i === provStep ? 'active' : ''}`}>
                  <span className="prov-ic">{i < provStep ? '✓' : '·'}</span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {screen === 'live' && agent && (
        <div className="live">
          <div className="live-topbar">
            <div style={{display:'flex',alignItems:'center'}}>
              <button className="sidebar-toggle" onClick={() => setSidebarOpen(s => !s)} className="hamburger" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",padding:"8px",color:"var(--text)",marginRight:8}}>☰</button>
              <div className="logo">AGENT<em>R</em></div>
            </div>
            <div className="live-topbar-r">
              <div className="status-badge"><div className="status-dot" />Active</div>
              {credits !== null && (
                <div style={{fontSize:12,fontWeight:500,color:'var(--text2)',background:'var(--bg)',border:'1px solid var(--border)',padding:'4px 12px',borderRadius:100}}>
                  {credits.toLocaleString()} credits
                </div>
              )}
              <div style={{transform:'scale(0.85)',transformOrigin:'right center'}}>
                <TonConnectButton />
              </div>
              {agent.username && (
                <a className="tg-btn" href={`https://t.me/${agent.username}`} target="_blank" rel="noreferrer">
                  Open in Telegram
                </a>
              )}
              <button className="disc-btn" onClick={disconnect}>Disconnect</button>
            </div>
          </div>

          {/* Sidebar overlay for mobile */}
          {sidebarOpen && <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />}

          <div className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>

            {sidebarItems.map(([id,label,avail]) => (
              <div key={id} className={`sb-item${liveTab===id?' active':''}${!avail?' locked':''}`} onClick={()=>{avail&&setLiveTab(id);setSidebarOpen(false);}}>
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
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0,margin:'-22px -22px 20px',borderBottom:'1px solid var(--border)'}}>
                    {[
                      {label:'Status',value:'Online',sub:'Listening for DMs',color:'var(--ok)'},
                      {label:'Model',value:provider==='codex'?'GPT-5.4 Codex':provider==='openai'?'GPT-4o':'Kimi K2',sub:provider==='codex'?'ChatGPT Codex':provider==='openai'?'ChatGPT API':'Moonshot AI',color:'var(--text)'},
                      {label:'Runtime',value:'Active',sub:'PM2 managed',color:'var(--text)'},
                    ].map((item,i)=> (
                      <div key={item.label} style={{padding:'16px 20px',borderRight:i<2?'1px solid var(--border)':'none'}}>
                        <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'.6px',color:'var(--text3)',marginBottom:6}}>{item.label}</div>
                        <div style={{fontSize:15,fontWeight:600,color:item.color,marginBottom:2}}>{item.value}</div>
                        <div style={{fontSize:11,color:'var(--text3)'}}>{item.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div className="info-label">How to use</div>
                  <div className="how-text">Message {agent.username ? <strong>@{agent.username}</strong> : 'your agent'} on Telegram in plain English. Ask it to build a bot, deploy a mini app, register a TON domain, monitor your wallet, or write and run any code. It handles everything end to end.</div>
                </div>

                <div className="info-card">
                  <div className="info-label" style={{marginBottom:14}}>AI Model</div>
                  <div className="provider-grid">
                    {[
                      {id:'codex',name:'ChatGPT Codex',sub:'Free — powered by Codex',img:'/openai.webp',available:true},
                      {id:'openai',name:'ChatGPT',sub:'GPT-4o, full API',img:'/openai.webp',available:false},
                      {id:'kimi',name:'Kimi',sub:'Fast and capable',img:'/kimi.webp',available:false},
                      {id:'claude',name:'Claude',sub:'Exceptional reasoning',img:'/claude.webp',available:false},
                      {id:'gemini',name:'Gemini',sub:'Multimodal intelligence',img:'/gemini.webp',available:false},
                    ].map(p => (
                      <div key={p.id} className={`prov-card${provider===p.id?' active':''}${!p.available?' locked':''}`} onClick={()=>p.available&&!switchingProvider&&switchProvider(p.id)}>
                        <div className="prov-img"><img src={p.img} alt={p.name} /></div>
                        <div><div className="prov-name">{p.name}</div><div className="prov-sub">{p.sub}</div></div>
                        {provider===p.id&&p.available&&<div className="prov-dot"/>}
                        {!p.available&&<span className="prov-soon">Soon</span>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="section-lbl" style={{fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'.6px',color:'var(--text3)',marginTop:8}}>Coming soon</div>
                <div className="live-coming-grid">
                  {[
                    {t:'Mini Apps',d:'Build and deploy Telegram Mini Apps'},
                    {t:'TON Sites',d:'Deploy decentralized websites'},
                    {t:'Sub-agents',d:'Spawn specialized child agents'},
                    
                  ].map(x=> (
                    <div key={x.t} className="live-coming-card">
                      <div className="lcc-title">{x.t}</div>
                      <div className="lcc-desc">{x.d}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {liveTab === 'workspace' && (<WorkspaceTab tenantId={agent.tenantId} apiBase={detectApiBase()} />)}
            {liveTab === 'marketplace' && (<MarketplaceTab tenantId={agent.tenantId} />)}
            {liveTab === 'credits' && (<CreditsTab tenantId={agent.tenantId} tonWallet={tonWallet} tonConnectUI={tonConnectUI} />)}
            {liveTab === 'bots' && (<BotsTab tenantId={agent.tenantId} />)}
            {liveTab === 'activity' && (<ActivityTab tenantId={agent.tenantId} />)}
          </div>

          {/* Bottom navigation for mobile */}
          {renderBottomNav()}
        </div>
      )}
    </>
  )
}

export default function App() {
  return (
    <TonConnectUIProvider manifestUrl="http://46.101.74.170:5173/tonconnect-manifest.json">
      <AppInnerWithWallet />
    </TonConnectUIProvider>
  )
}

function AppInnerWithWallet() {
  const [tonConnectUI] = useTonConnectUI()
  const tonAddress = useTonAddress()
  const tonWallet = useTonWallet()
  return <AppInner tonConnectUI={tonConnectUI} tonAddress={tonAddress} tonWallet={tonWallet} />
}
