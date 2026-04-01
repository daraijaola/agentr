const http = require('http')
const fs = require('fs')
const path = require('path')

// Load .env from repo root so API_PORT, SITES_PATH etc. are always available
// even when PM2 starts this process without inheriting the shell environment
try {
  const envPath = path.resolve(__dirname, '../../.env')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!(key in process.env)) process.env[key] = val
    }
  }
} catch {}

const dist = path.join(__dirname, 'dist')
const SITES_ROOT = process.env.SITES_PATH || '/var/www/agentr-sites'
const API_PORT = parseInt(process.env.API_PORT || '3001', 10)

// Proxy a request to the API server
function proxyToApi(req, res) {
  const opts = {
    hostname: '127.0.0.1',
    port: API_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` },
  }
  const proxy = http.request(opts, (apiRes) => {
    res.writeHead(apiRes.statusCode, apiRes.headers)
    apiRes.pipe(res)
  })
  proxy.on('error', () => { res.writeHead(502); res.end('API unavailable') })
  req.pipe(proxy)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0]

  // Proxy API routes to the backend API server
  if (url.startsWith('/agent/') || url.startsWith('/auth/') || url.startsWith('/dev/') || url === '/health') {
    return proxyToApi(req, res)
  }

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(path.join(dist, 'landing.html')).pipe(res)
    return
  }

  if (url === '/app' || url === '/app/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(path.join(__dirname, 'public', 'app.html')).pipe(res)
    return
  }

  if (url === '/coder' || url === '/coder/') {
    const p = path.join(__dirname, 'public', 'codeR.html')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(p).pipe(res)
    return
  }

  // Serve agent-published static sites from /sites/<tenantId>/...
  if (url.startsWith('/sites/')) {
    const sitePath = path.join(SITES_ROOT, url.slice('/sites/'.length))
    // Resolve index.html for directory requests
    const candidates = [sitePath, path.join(sitePath, 'index.html')]
    const found = candidates.find(p => {
      try { return fs.statSync(p).isFile() } catch { return false }
    })
    if (found) {
      const ext = path.extname(found)
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      fs.createReadStream(found).pipe(res)
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
    return
  }

  // Check dist/ first, then public/ as fallback for static assets
  const candidates = [path.join(dist, url), path.join(__dirname, 'public', url)]
  for (const filePath of candidates) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath)
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      fs.createReadStream(filePath).pipe(res)
      return
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  fs.createReadStream(path.join(dist, 'app.html')).pipe(res)
}).listen(5173, '0.0.0.0', () => console.log(`AGENTR dashboard running on :5173 → API proxy → :${API_PORT}`))
