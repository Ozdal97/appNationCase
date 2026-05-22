// Minimal zero-dependency static server. Serves the demo HTML/CSS/JS so the
// browser request origin is http://localhost:8080 — keeps CORS predictable.
//
//   node serve.js          # listens on 8080
//   PORT=4000 node serve.js
//
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const abs = path.join(ROOT, rel);

  // Prevent directory traversal.
  if (!abs.startsWith(ROOT)) {
    res.writeHead(403); return res.end('forbidden');
  }

  fs.readFile(abs, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`demo client → http://localhost:${PORT}`);
  console.log(`backend expected at http://localhost:3000 (override in the top bar)`);
});
