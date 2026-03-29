import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { apiGet, post, getAuthHeader } from '../lib/api'

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })))

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>
  timestamp: number
}

const MODELS = [
  { id: 'air', label: 'AIR (Default)', desc: 'AGENTR base model' },
  { id: 'claude', label: 'Claude Opus', desc: 'Best for complex contracts' },
  { id: 'claude-sonnet', label: 'Claude Sonnet', desc: 'Fast + smart' },
  { id: 'codex', label: 'Codex (o4-mini)', desc: 'Code-first reasoning' },
  { id: 'gpt4', label: 'GPT-4o', desc: 'General purpose' },
]

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  tact: 'rust', fc: 'c', func: 'c', py: 'python',
  json: 'json', md: 'markdown', html: 'html', css: 'css',
  sh: 'shell', env: 'ini', toml: 'ini',
}

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LANG_MAP[ext] ?? 'plaintext'
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

export function DevTab({ tenantId, apiBase }: { tenantId: string; apiBase: string }) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [model, setModel] = useState('air')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadFiles() }, [tenantId])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadFiles() {
    try {
      const res = await fetch(`${apiBase}/dev/files/${tenantId}`, { headers: getAuthHeader() })
      const data = await res.json()
      if (data.success) setFiles(data.files)
    } catch {}
  }

  async function openFile(path: string) {
    setSelectedFile(path)
    setLoadingFile(true)
    try {
      const res = await fetch(`${apiBase}/dev/file/${tenantId}?path=${encodeURIComponent(path)}`, { headers: getAuthHeader() })
      const data = await res.json()
      if (data.success) setFileContent(data.content)
    } catch {
      setFileContent('// Error loading file')
    } finally {
      setLoadingFile(false)
    }
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    const msg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: Date.now() }])
    setSending(true)
    try {
      const res = await fetch(`${apiBase}/dev/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ tenantId, message: msg, model }),
      })
      const data = await res.json()
      if (data.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.response,
          toolCalls: data.toolCalls,
          timestamp: Date.now(),
        }])
        // Reload files in case agent wrote something
        loadFiles()
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}`, timestamp: Date.now() }])
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Try again.', timestamp: Date.now() }])
    } finally {
      setSending(false)
    }
  }

  async function clearSession() {
    await fetch(`${apiBase}/dev/session`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ tenantId, model }),
    })
    setMessages([])
  }

  function toggleDir(path: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(path) ? n.delete(path) : n.add(path)
      return n
    })
  }

  // Build tree structure
  function renderTree(items: FileEntry[], prefix = '', depth = 0): React.ReactNode[] {
    const nodes: React.ReactNode[] = []
    const atLevel = items.filter(f => {
      const parts = f.path.split('/')
      const parentPath = parts.slice(0, -1).join('/')
      return parentPath === prefix
    })

    for (const item of atLevel) {
      const isOpen = expanded.has(item.path)
      const isSelected = selectedFile === item.path

      if (item.type === 'dir') {
        nodes.push(
          <div key={item.path}>
            <div
              className={`dev-tree-item dev-tree-dir${isOpen ? ' open' : ''}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => toggleDir(item.path)}
            >
              <span className="dev-tree-arrow">{isOpen ? '▾' : '▸'}</span>
              <span className="dev-tree-icon">📁</span>
              <span>{item.name}</span>
            </div>
            {isOpen && renderTree(items, item.path, depth + 1)}
          </div>
        )
      } else {
        nodes.push(
          <div
            key={item.path}
            className={`dev-tree-item dev-tree-file${isSelected ? ' selected' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => openFile(item.path)}
          >
            <span className="dev-tree-icon">{getFileIcon(item.name)}</span>
            <span className="dev-tree-name">{item.name}</span>
            {item.size ? <span className="dev-tree-size">{formatSize(item.size)}</span> : null}
          </div>
        )
      }
    }
    return nodes
  }

  return (
    <div className="dev-tab">
      {/* Top bar */}
      <div className="dev-topbar">
        <div className="dev-title">
          <span className="dev-badge">DEV</span>
          <span>Developer Mode</span>
        </div>
        <div className="dev-model-select">
          <label>Model:</label>
          <select value={model} onChange={e => setModel(e.target.value)}>
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
        <button className="dev-clear-btn" onClick={clearSession}>Clear Session</button>
      </div>

      <div className="dev-body">
        {/* File tree */}
        <div className="dev-sidebar">
          <div className="dev-sidebar-header">
            <span>Files</span>
            <button className="dev-refresh-btn" onClick={loadFiles} title="Refresh">↻</button>
          </div>
          <div className="dev-tree">
            {files.length === 0
              ? <div className="dev-empty-tree">No files yet. Ask the agent to write a contract.</div>
              : renderTree(files)
            }
          </div>
        </div>

        {/* Monaco editor */}
        <div className="dev-editor">
          {selectedFile ? (
            <>
              <div className="dev-editor-header">
                <span className="dev-file-path">{selectedFile}</span>
                <span className="dev-lang-badge">{getLanguage(selectedFile)}</span>
              </div>
              {loadingFile ? (
                <div className="dev-editor-loading">Loading...</div>
              ) : (
                <Suspense fallback={<div className="dev-editor-loading">Loading editor...</div>}>
                  <MonacoEditor
                    height="100%"
                    language={getLanguage(selectedFile)}
                    value={fileContent}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      renderWhitespace: 'none',
                    }}
                  />
                </Suspense>
              )}
            </>
          ) : (
            <div className="dev-editor-empty">
              <div className="dev-editor-empty-icon">⌨️</div>
              <div className="dev-editor-empty-title">No file selected</div>
              <div className="dev-editor-empty-sub">Click a file in the tree, or ask the agent to write code</div>
              <div className="dev-quick-actions">
                <button onClick={() => setInput('Write a simple counter smart contract in Tact and compile it')}>
                  Write a counter contract
                </button>
                <button onClick={() => setInput('Deploy a jetton token called TEST with 1000000 supply to testnet')}>
                  Deploy a testnet jetton
                </button>
                <button onClick={() => setInput('Write a Telegram bot in TypeScript using grammy that says hello')}>
                  Create a Telegram bot
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Chat panel */}
        <div className="dev-chat">
          <div className="dev-chat-messages">
            {messages.length === 0 && (
              <div className="dev-chat-welcome">
                <div className="dev-chat-welcome-icon">🛠️</div>
                <div className="dev-chat-welcome-title">TON Developer Agent</div>
                <div className="dev-chat-welcome-sub">
                  Ask me to write contracts, deploy tokens, build bots, or anything TON/Telegram related.
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`dev-msg dev-msg-${msg.role}`}>
                <div className="dev-msg-header">
                  <span className="dev-msg-role">{msg.role === 'user' ? 'You' : 'Agent'}</span>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <span className="dev-msg-tools">
                      {msg.toolCalls.map(tc => tc.name).join(', ')}
                    </span>
                  )}
                </div>
                <div className="dev-msg-content">{msg.content}</div>
              </div>
            ))}
            {sending && (
              <div className="dev-msg dev-msg-assistant dev-msg-loading">
                <div className="dev-msg-header"><span className="dev-msg-role">Agent</span></div>
                <div className="dev-typing"><span /><span /><span /></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="dev-chat-input-row">
            <textarea
              className="dev-chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Ask the agent to write contracts, deploy tokens, build bots..."
              rows={3}
              disabled={sending}
            />
            <button className="dev-send-btn" onClick={sendMessage} disabled={sending || !input.trim()}>
              {sending ? '...' : '→'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  const icons: Record<string, string> = {
    tact: '📜', fc: '⛓️', func: '⛓️', ts: '📘', js: '📙',
    json: '📋', md: '📝', html: '🌐', css: '🎨', env: '🔑',
    sh: '⚙️', py: '🐍', toml: '⚙️',
  }
  return icons[ext ?? ''] ?? '📄'
}
