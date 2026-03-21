const http = require('http')
const fs = require('fs')
const path = require('path')
const dist = path.join(__dirname, 'dist')

http.createServer((req, res) => {
  const url = req.url.split('?')[0]
  
  // Admin route
  if (url === '/admin' || url === '/admin/') {
    const f = path.join(dist, 'admin.html')
    res.writeHead(200, {'Content-Type':'text/html'})
    fs.createReadStream(f).pipe(res)
    return
  }
  
  // Static files
  let filePath = path.join(dist, url)
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath)
    const types = {'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp','.json':'application/json','.ico':'image/x-icon','.svg':'image/svg+xml'}
    res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream'})
    fs.createReadStream(filePath).pipe(res)
    return
  }
  
  // SPA fallback
  res.writeHead(200, {'Content-Type':'text/html'})
  fs.createReadStream(path.join(dist, 'index.html')).pipe(res)
}).listen(5173, '0.0.0.0', () => console.log('Dashboard running on :5173'))
