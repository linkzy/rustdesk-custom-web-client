// Serves the built web app and proxies the gateway endpoints to it.
//
//   node e2e/serve.mjs            # PORT=5173 GATEWAY=http://127.0.0.1:4000
//
// Why this exists: the app talks to `/ws` and `/config` on its own origin, and
// neither `vite preview` nor a plain static server proxies those. In dev, Vite's
// dev server does it (web/vite.config.ts, gateway hardcoded on port 4000) — which
// is no use when the tests run several stacks on ephemeral ports.
//
// So the e2e harness brings its own: static files from web/dist, WebSocket and
// HTTP proxying to whatever gateway it was told about. No dependency (ws comes
// from gateway/) and no change to web/.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'gateway', 'package.json'));
const { WebSocket, WebSocketServer } = require('ws');

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.WEB_DIST ?? path.resolve(here, '..', 'web', 'dist');
const PORT = Number(process.env.PORT ?? 5173);
const HOST = process.env.HOST ?? '127.0.0.1';
const GATEWAY = (process.env.GATEWAY ?? 'http://127.0.0.1:4000').replace(/\/$/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`[serve] no build at ${DIST} — run "npm --prefix web run build" first`);
  process.exit(1);
}

/** Resolves a URL path to a file inside DIST, or null. */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = path.normalize(path.join(DIST, clean));
  // Never serve outside DIST.
  if (!candidate.startsWith(DIST)) return null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  return null;
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  // Everything that is not a static asset belongs to the gateway: /config today,
  // anything the app adds later, and the SPA fallback for client-side routes.
  const file = resolveFile(url);
  if (file) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
    return;
  }

  if (url.startsWith('/config')) {
    proxyHttp(req, res);
    return;
  }

  // SPA fallback.
  res.writeHead(200, { 'Content-Type': MIME['.html'] });
  fs.createReadStream(path.join(DIST, 'index.html')).pipe(res);
});

/** Forwards an HTTP request to the gateway. */
function proxyHttp(req, res) {
  const target = new URL(GATEWAY);
  const upstream = http.request(
    {
      host: target.hostname,
      port: target.port || 80,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`gateway unreachable: ${e.message}`);
  });
  req.pipe(upstream);
}

// WebSocket proxying: accept the browser's /ws connection and bridge it to the
// gateway's /ws, forwarding messages untouched in both directions.
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!(req.url ?? '').startsWith('/ws')) {
    socket.destroy();
    return;
  }

  const target = GATEWAY.replace(/^http/, 'ws');
  const upstream = new WebSocket(`${target}/ws`);

  upstream.on('open', () => {
    wss.handleUpgrade(req, socket, head, (client) => {
      client.on('message', (data, isBinary) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      });
      client.on('close', () => { try { upstream.close(); } catch { /* already */ } });
      client.on('error', () => { try { upstream.terminate(); } catch { /* already */ } });

      upstream.on('message', (data, isBinary) => {
        if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
      });
      upstream.on('close', () => { try { client.close(); } catch { /* already */ } });
    });
  });

  upstream.on('error', () => {
    socket.destroy();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[serve] ${DIST} on http://${HOST}:${PORT}, /ws and /config → ${GATEWAY}`);
});
