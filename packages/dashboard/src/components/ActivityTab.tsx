import React from 'react'
import { detectApiBase, getAuthHeader } from '../lib/api'

interface Message {
  id: string
  userMessage: string
  reply: string
  toolCalls?: { name: string }[]
  createdAt: string
}

interface Props {
  tenantId: string
}

export function ActivityTab({ tenantId }: Props) {
  const [msgs, setMsgs] = React.useState<Message[]>([])
  const [loading, setLoading] = React.useState(true)
  const API = detectApiBase()

  React.useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(API + '/agent/activity/' + tenantId, { headers: getAuthHeader() })
        const d = await res.json()
        if (d.activity) setMsgs(d.activity)
      } catch {
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="tab-content">
      <div className="tab-title" style={{ marginBottom: 6 }}>
        Activity
      </div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
        Recent tasks your agent has completed.
      </div>
      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 14 }}>Loading...</div>
      ) : msgs.length === 0 ? (
        <div className="activity-empty">
          No activity yet. Message your agent on Telegram to get started.
        </div>
      ) : (
        <div className="activity-list">
          {msgs.map((m) => (
            <div key={m.id} className="activity-item">
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                {m.userMessage}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                {m.reply?.slice(0, 160)}
                {m.reply?.length > 160 ? '...' : ''}
              </div>
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {m.toolCalls.map((t) => (
                    <span key={t.name} className="activity-tool">
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {new Date(m.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
