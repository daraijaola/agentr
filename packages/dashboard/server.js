const http = require('http')
const fs = require('fs')
const path = require('path')
const dist = path.join(__dirname, 'dist')
const SITES_ROOT = process.env.SITES_PATH || '/var/www/agentr-sites'

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

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(path.join(dist, 'landing.html')).pipe(res)
    return
  }

  if (url === '/app' || url === '/app/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(path.join(dist, 'app.html')).pipe(res)
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

  const filePath = path.join(dist, url)
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    fs.createReadStream(filePath).pipe(res)
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  fs.createReadStream(path.join(dist, 'app.html')).pipe(res)
}).listen(5173, '0.0.0.0', () => console.log('AGENTR running on :5173'))
