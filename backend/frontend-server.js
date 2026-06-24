const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 5500;
const API_PORT = 5000;
const API_HOST = '127.0.0.1';
const frontendDir = path.join(__dirname, '..', 'frontend');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const ROUTE_MAP = {
  '/admin': 'admin.html',
  '/admin-login': 'admin-login.html',
  '/product': 'product.html',
  '/checkout': 'checkout.html',
  '/profile': 'profile.html',
  '/chat': 'chat.html',
};

http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  const reqPath = parsedUrl.pathname;

  // Proxy API and upload requests to backend
  if (reqPath.startsWith('/api/') || reqPath.startsWith('/uploads/')) {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` }
    };
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend server unavailable' }));
    });
    req.pipe(proxyReq);
    return;
  }

  // Resolve path: check route map first, then direct file
  let relativePath = ROUTE_MAP[reqPath] || reqPath.slice(1);
  let filePath = reqPath === '/' 
    ? path.join(frontendDir, 'index.html')
    : path.join(frontendDir, relativePath);

  if (!filePath.startsWith(frontendDir)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // If it's a single-segment path with no extension, treat as product slug
      const pathParts = reqPath.replace(/\/+$/, '').split('/').filter(Boolean);
      const fallbackPage = (pathParts.length === 1 && !path.extname(pathParts[0]))
        ? 'product.html'
        : 'index.html';
      fs.readFile(path.join(frontendDir, fallbackPage), (err2, data2) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`Backend API: http://localhost:5000\n`);
});
