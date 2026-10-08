/** Minimal static file server for presenter mode. No external dependencies. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.vtt': 'text/vtt; charset=utf-8',
};

export function startServer({ root, port = 4173, host = '127.0.0.1' }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/src/index.html';
      const file = path.normalize(path.join(root, pathname));
      if (!file.startsWith(root)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      fs.stat(file, (err, stat) => {
        if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        fs.createReadStream(file).pipe(res);
      });
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && port !== 0) {
        console.warn(`Port ${port} is in use; picking a free port.`);
        server.listen(0, host);
      } else reject(err);
    });
    server.listen(port, host, () => resolve({ server, port: server.address().port }));
  });
}
