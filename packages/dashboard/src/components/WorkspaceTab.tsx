import React from 'react'
import { detectApiBase, getAuthHeader } from '../lib/api'

const CORE_FILES = ['SOUL.md', 'IDENTITY.md', 'STRATEGY.md', 'SECURITY.md', 'USER.md', 'MEMORY.md']

interface Props {
  tenantId: string
  apiBase: string
}

export function WorkspaceTab({ tenantId, apiBase }: Props) {
  const [files, setFiles] = React.useState<string[]>([])
  const [activeFile, setActiveFile] = React.useState<string | null>(null)
  const [fileContent, setFileContent] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [mobileFilesOpen, setMobileFilesOpen] = React.useState(false)

  const loadFiles = async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase + '/agent/workspace/' + tenantId, { headers: getAuthHeader() })
      const d = await res.json()
      if (d.files) {
        const sorted = [
          ...CORE_FILES.filter((f) => d.files.includes(f)),
          ...d.files.filter((f: string) => !CORE_FILES.includes(f)).sort(),
        ]
        setFiles(sorted)
        if (!activeFile && sorted.length > 0) openFile(sorted[0], apiBase)
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const openFile = async (name: string, base?: string) => {
    setActiveFile(name)
    setFileContent('')
    setMobileFilesOpen(false)
    try {
      const res = await fetch(
        (base || apiBase) + '/agent/workspace/' + tenantId + '/' + encodeURIComponent(name),
        { headers: getAuthHeader() }
      )
      const d = await res.json()
      setFileContent(d.content ?? '')
    } catch {
      setFileContent('')
    }
  }

  const saveFile = async () => {
    if (!activeFile) return
    setSaving(true)
    try {
      await fetch(apiBase + '/agent/workspace/' + tenantId + '/' + encodeURIComponent(activeFile), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ content: fileContent }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
    } finally {
      setSaving(false)
    }
  }

  React.useEffect(() => {
    loadFiles()
  }, [tenantId])

  return (
    <div className="workspace-container">
      <button className="mobile-files-toggle" onClick={() => setMobileFilesOpen(!mobileFilesOpen)}>
        <span>{mobileFilesOpen ? '✕ Close' : '☰ Files'}</span>
        {activeFile && <span className="active-file-name">{activeFile}</span>}
      </button>

      <div className={`ws-files ${mobileFilesOpen ? 'mobile-open' : ''}`}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: 'var(--text3)',
            padding: '0 16px 10px',
          }}
        >
          Files
        </div>
        {loading ? (
          <div style={{ padding: '16px', fontSize: 13, color: 'var(--text3)' }}>Loading...</div>
        ) : files.length === 0 ? (
          <div style={{ padding: '16px', fontSize: 13, color: 'var(--text3)' }}>
            No files yet. Your agent creates files as it works.
          </div>
        ) : (
          files.map((f) => (
            <div
              key={f}
              onClick={() => openFile(f)}
              style={{
                padding: '9px 16px',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                background: activeFile === f ? 'var(--blue-bg)' : 'transparent',
                color: activeFile === f ? 'var(--blue)' : 'var(--text2)',
                borderLeft: activeFile === f ? '2px solid var(--blue)' : '2px solid transparent',
                transition: 'all .15s',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f}
              </span>
              {CORE_FILES.includes(f) && (
                <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>core</span>
              )}
            </div>
          ))
        )}
      </div>

      {mobileFilesOpen && (
        <div className="mobile-files-overlay" onClick={() => setMobileFilesOpen(false)} />
      )}

      <div className="ws-editor">
        {activeFile ? (
          <>
            <div className="ws-editor-head">
              <span className="ws-file-name">{activeFile}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={saveFile}
                  disabled={saving}
                  className={`ws-save-btn ${saved ? 'saved' : ''}`}
                >
                  {saved ? 'Saved' : saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={loadFiles} className="ws-refresh-btn">
                  Refresh
                </button>
              </div>
            </div>
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="ws-textarea"
              placeholder="Empty file..."
            />
          </>
        ) : (
          <div className="ws-empty">Select a file to view or edit</div>
        )}
      </div>
    </div>
  )
}
