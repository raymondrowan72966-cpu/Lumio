#!/usr/bin/env node
/**
 * Lumio development proxy — port 4173
 *
 * Replicates the Cloudflare Pages production topology locally:
 *   /api/*  → strip /api prefix → forward to wrangler dev Worker on :8787
 *   all else → serve Lumio Prototype/ static files
 *
 * Development tool only. Not deployed. Not imported by any application code.
 * Node.js built-in modules only — no npm install required.
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const STATIC_ROOT  = path.resolve(__dirname, '..', 'Lumio Prototype');
const WORKER_HOST  = '127.0.0.1';
const WORKER_PORT  = 8787;
const PROXY_PORT   = 4173;

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.css':   'text/css',
  '.js':    'application/javascript',
  '.json':  'application/json',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.mp3':   'audio/mpeg',
  '.mp4':   'video/mp4',
  '.webm':  'video/webm',
  '.pdf':   'application/pdf',
  '.txt':   'text/plain; charset=utf-8',
};

// ── API proxy ─────────────────────────────────────────────────────────────────
// Mirrors what the Cloudflare dashboard Worker Route does in production:
// receive /api/*, strip the /api prefix, forward to the Worker verbatim.
// The browser sees a single origin (localhost:4173) so no CORS header is
// sent — identical to production behaviour where the browser talks to
// lumio-6kn.pages.dev and the Pages → Worker hop is server-side.

function proxyToWorker(req, res) {
  const url = new URL(req.url, `http://localhost:${PROXY_PORT}`);

  // Strip /api prefix; preserve path remainder and query string
  const workerPath = url.pathname.slice('/api'.length) + url.search;

  // Forward all request headers; replace Host with the Worker's address
  const headers = Object.assign({}, req.headers, {
    host: `${WORKER_HOST}:${WORKER_PORT}`,
  });

  const options = {
    hostname: WORKER_HOST,
    port:     WORKER_PORT,
    path:     workerPath || '/',
    method:   req.method,
    headers,
  };

  const workerReq = http.request(options, (workerRes) => {
    console.log(`[api]  ${req.method} ${req.url} → ${workerRes.statusCode}`);
    // Forward all response headers verbatim — Set-Cookie must pass through
    // unchanged so auth cookies are set on localhost:4173, not :8787.
    res.writeHead(workerRes.statusCode, workerRes.headers);
    workerRes.pipe(res, { end: true });
  });

  workerReq.on('error', (err) => {
    console.error(`[api]  ${req.method} ${req.url} → 502 (${err.message})`);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
    }
    res.end(JSON.stringify({
      error:   'worker_unavailable',
      message: err.message,
      hint:    'Is `cd backend && npx wrangler dev` running?',
    }));
  });

  // Forward request body (POST / PUT / PATCH)
  req.pipe(workerReq, { end: true });
}

// ── Static file server ────────────────────────────────────────────────────────

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PROXY_PORT}`);
  const relPath = url.pathname === '/' ? '/index.html' : url.pathname;

  // Resolve and guard against path traversal
  const filePath = path.normalize(path.join(STATIC_ROOT, relPath));
  const safeRoot = STATIC_ROOT + path.sep;
  if (!filePath.startsWith(safeRoot) && filePath !== STATIC_ROOT) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': contentType });
    fs.createReadStream(filePath).pipe(res, { end: true });
  });
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
    proxyToWorker(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log('');
  console.log('┌──────────────────────────────────────────────────────┐');
  console.log('│  Lumio Dev Environment                               │');
  console.log('├──────────────────────────────────────────────────────┤');
  console.log(`│  Open   →  http://localhost:${PROXY_PORT}                   │`);
  console.log(`│  Static →  Lumio Prototype/                          │`);
  console.log(`│  API    →  /api/* → localhost:${WORKER_PORT} (wrangler dev) │`);
  console.log('└──────────────────────────────────────────────────────┘');
  console.log('');
});
