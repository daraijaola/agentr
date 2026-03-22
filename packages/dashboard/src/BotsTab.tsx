import React from 'react'
import { detectApiBase } from '../lib/api'

interface Process {
  name: string
  status: string
  pid: number
}

interface Props {
  tenantId: string
}

export function BotsTab({ tenantId }: Props) {
  const [procs, setProcs] = React.useState<Process[]>([])
  const [logs, setLogs] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(true)
  const [viewLogs, setViewLogs] = React.useState<string | null>(null)
  const API = detectApiBase()

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(API + '/agent/processes/' + tenantId)
      const d = await res.json()
      if (d.processes) setProcs(d.processes)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async (name: string) => {
    try {
      const res = await fetch(API + '/agent/logs/' + tenantId + '/' + name)
      const d = await res.json()
      if (d.logs) setLogs((prev) => ({ ...prev, [name]: d.logs }))
    } catch {}
    setViewLogs(name)
  }

  const stopProc = async (name: string) => {
    try {
      await fetch(API + '/agent/process/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, name }),
      })
      load()
    } catch {}
  }

  React.useEffect(() => {
    load()
  }, [])

  return (
    <div className="tab-content">
      <div className="tab-header">
        <div className="tab-title">Bots & Processes</div>
        <button onClick={load} className="ws-refresh-btn">
          Refresh
        </button>
      </div>
      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 14 }}>Loading...</div>
      ) : procs.length === 0 ? (
        <div className="bots-empty">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>No bots running yet.</div>
          <div>Message your agent on Telegram and ask it to create and deploy a bot.</div>
        </div>
      ) : (
        <div className="bots-list">
          {procs.map((p) => (
            <div key={p.name} className="bot-card">
              <div className="bot-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: p.status === 'online' ? 'var(--ok)' : 'var(--err)',
                      flexShrink: 0,
                      boxShadow: p.status === 'online' ? '0 0 6px var(--ok)' : 'none',
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {p.status} · PID {p.pid}
                    </div>
                  </div>
                </div>
                <div className="bot-actions">
                  <button onClick={() => fetchLogs(p.name)} className="bot-btn-logs">
                    Logs
                  </button>
                  <button onClick={() => stopProc(p.name)} className="bot-btn-stop">
                    Stop
                  </button>
                </div>
              </div>
              {viewLogs === p.name && logs[p.name] && (
                <pre className="bot-logs">{logs[p.name]}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
