// Starts and stops the stack the end-to-end specs run against:
//
//   fake RustDesk host  (hbbs + hbbr + control API, ephemeral ports)
//   gateway             (ts-node, pointed at the fake host)
//   web                 (vite dev server)
//
// Everything binds an ephemeral port and stop() terminates it, so a failed spec
// leaves no server, socket or child process behind — the lesson from
// browser-check.mjs, which used to leak a browser on the failure path.
//
// Children are spawned as `node <entry.js>`, never through a shell: a shell
// would mean child.kill() only signals the wrapper while the real server keeps
// the port. It also keeps us away from taskkill, which is not allowed here.

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..');

const GATEWAY_DIR = path.join(REPO_ROOT, 'gateway');
const WEB_DIR = path.join(REPO_ROOT, 'web');

const TS_NODE_BIN = path.join(GATEWAY_DIR, 'node_modules', 'ts-node', 'dist', 'bin.js');
const SERVE_BIN = path.join(REPO_ROOT, 'e2e', 'serve.mjs');
const VITE_BIN = path.join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js');

/** A free port from the OS. Racy in theory, fine for a test harness. */
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** Polls `url` until it answers 2xx, or throws after the deadline. */
async function waitForHttp(url, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = e.message;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timed out waiting for ${what} at ${url}: ${lastError}`);
}

/** Spawns `node entry.js args…` with no shell, capturing output. */
function runNode(entry, args, options) {
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  child.stdout?.on('data', (d) => { buffer += d.toString(); });
  child.stderr?.on('data', (d) => { buffer += d.toString(); });

  const kill = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    // Give it a moment, then insist. Both target this one pid, never a name.
    await new Promise((r) => setTimeout(r, 300));
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  };

  return { child, output: () => buffer, kill };
}

/** Runs a command to completion and rejects on a non-zero exit. */
function runToCompletion(command, args, options, what) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout?.on('data', (d) => { output += d.toString(); });
    child.stderr?.on('data', (d) => { output += d.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${what} failed (exit ${code}):\n${output}`));
    });
  });
}

/** Starts the fake host and reads its JSON ready line for the real ports. */
async function startFakeHostProcess(log) {
  const password = 'e2e-password';
  const id = '123456789';

  const proc = runNode(TS_NODE_BIN, ['--transpile-only', 'test/fake-host/cli.ts', '--json', '--quiet'], {
    cwd: GATEWAY_DIR,
    env: {
      FAKE_HOST_ID: id,
      FAKE_HOST_PASSWORD: password,
      FAKE_HBBS_PORT: '0',
      FAKE_HBBR_PORT: '0',
      FAKE_CONTROL_PORT: '0',
    },
  });

  const info = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      reject(new Error(`fake host did not report ready in 60s:\n${proc.output()}`));
    }, 60_000);

    const onData = (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (!parsed.ready) continue;
          clearTimeout(deadline);
          resolve({
            id: parsed.id,
            password,
            hbbsPort: parsed.hbbsPort,
            hbbrPort: parsed.hbbrPort,
            controlPort: parsed.controlPort,
            screen: parsed.screen,
          });
        } catch { /* not the ready line */ }
      }
    };

    proc.child.stdout?.on('data', onData);
    proc.child.once('exit', (code) => {
      clearTimeout(deadline);
      reject(new Error(`fake host exited early (code ${code}):\n${proc.output()}`));
    });
  });

  log(`[stack] fake host ready on hbbs=${info.hbbsPort} hbbr=${info.hbbrPort} control=${info.controlPort}`);
  return { info, ...proc };
}

/**
 * The stack that CI starts as background services. Reads its addresses from the
 * environment and never starts or stops anything: the workflow owns those
 * processes, not the test runner.
 */
async function externalStack(log) {
  const required = ['E2E_GATEWAY_URL', 'E2E_APP_URL', 'E2E_CONTROL_URL'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`E2E_EXTERNAL is set but ${missing.join(', ')} are not`);
  }

  const id = process.env.E2E_ID ?? '123456789';
  const password = process.env.E2E_PASSWORD ?? 'e2e-password';
  const controlBase = process.env.E2E_CONTROL_URL.replace(/\/$/, '');

  // Fail fast and loudly if a service is not actually up: a clear message here
  // beats a confusing timeout inside a browser later.
  await waitForHttp(`${controlBase}/fake/health`, 30_000, 'fake host (external)');
  await waitForHttp(`${process.env.E2E_GATEWAY_URL}/config`, 30_000, 'gateway (external)');
  await waitForHttp(`${process.env.E2E_APP_URL}/`, 30_000, 'web app (external)');

  const control = {
    state: async () => (await fetch(`${controlBase}/fake/state`)).json(),
    events: async (type) => {
      const url = type ? `${controlBase}/fake/events?type=${type}` : `${controlBase}/fake/events`;
      const body = await (await fetch(url)).json();
      return body.events;
    },
    clearEvents: async () => {
      await fetch(`${controlBase}/fake/events`, { method: 'POST' });
    },
    waitForFrames: async (count, timeoutMs = 30_000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const state = await control.state();
        if ((state.session?.framesSent ?? 0) >= count) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`fake host did not send ${count} frames in ${timeoutMs}ms`);
    },
  };

  log(`[stack] using external services: gateway=${process.env.E2E_GATEWAY_URL} app=${process.env.E2E_APP_URL} control=${controlBase}`);

  return {
    fakeHost: {
      id,
      password,
      hbbsPort: Number(process.env.E2E_HBBS_PORT ?? 0),
      hbbrPort: Number(process.env.E2E_HBBR_PORT ?? 0),
      controlPort: Number(new URL(controlBase).port),
      screen: { width: 640, height: 360, fps: 30 },
    },
    gatewayUrl: process.env.E2E_GATEWAY_URL,
    appUrl: process.env.E2E_APP_URL,
    control,
    logs: () => '(external services: output is in the CI step logs)',
    // Nothing was started here, so there is nothing to stop.
    stop: async () => {},
  };
}

/**
 * Brings up the whole stack. Call `stop()` in a finally; it is idempotent and
 * terminates every process this function started.
 *
 * If E2E_EXTERNAL is set, nothing is started: the URLs come from the
 * environment instead, so CI can run the fake host, gateway and web as
 * separate background services (one fresh process each step, which is how a
 * workflow job actually works) and point the test runner at them.
 */
export async function startStack(options = {}) {
  const log = options.log ?? (() => {});

  if (process.env.E2E_EXTERNAL === '1' || process.env.E2E_EXTERNAL === 'true') {
    return externalStack(log);
  }

  const procs = [];

  const fake = await startFakeHostProcess(log);
  procs.push(fake);

  const gatewayPort = await freePort();
  const gateway = runNode(TS_NODE_BIN, ['--transpile-only', 'src/server.ts'], {
    cwd: GATEWAY_DIR,
    env: {
      GATEWAY_PORT: String(gatewayPort),
      HBBS_HOST: '127.0.0.1',
      HBBS_WS_PORT: String(fake.info.hbbsPort),
      HBBR_HOST: '127.0.0.1',
      HBBR_WS_PORT: String(fake.info.hbbrPort),
      ...options.gatewayEnv,
    },
  });
  procs.push(gateway);

  const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
  await waitForHttp(`${gatewayUrl}/config`, 60_000, 'gateway');
  log(`[stack] gateway ready at ${gatewayUrl}`);

  let webPort;
  if (options.startWeb === false) {
    webPort = Number(process.env.WEB_PORT ?? 5173);
  } else {
    // Build once, then serve: a production build is what users get, and
    // e2e/serve.mjs proxies /ws and /config to this stack's gateway. That is
    // the piece Vite's dev server cannot do for several stacks on ephemeral
    // ports (its proxy target is fixed at build time in web/vite.config.ts).
    if (options.build !== false) {
      await runToCompletion(
        process.execPath,
        [VITE_BIN, 'build'],
        { cwd: WEB_DIR, env: {} },
        'web build',
      );
    }

    webPort = await freePort();
    const web = runNode(SERVE_BIN, [], {
      cwd: REPO_ROOT,
      env: {
        PORT: String(webPort),
        HOST: '127.0.0.1',
        GATEWAY: `http://127.0.0.1:${gatewayPort}`,
      },
    });
    procs.push(web);
    await waitForHttp(`http://127.0.0.1:${webPort}/`, 60_000, 'web app');
    log(`[stack] web ready at http://127.0.0.1:${webPort}`);
  }

  const controlBase = `http://127.0.0.1:${fake.info.controlPort}`;
  const control = {
    state: async () => (await fetch(`${controlBase}/fake/state`)).json(),
    events: async (type) => {
      const url = type ? `${controlBase}/fake/events?type=${type}` : `${controlBase}/fake/events`;
      const body = await (await fetch(url)).json();
      return body.events;
    },
    clearEvents: async () => {
      await fetch(`${controlBase}/fake/events`, { method: 'POST' });
    },
    waitForFrames: async (count, timeoutMs = 30_000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const state = await control.state();
        if ((state.session?.framesSent ?? 0) >= count) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`fake host did not send ${count} frames in ${timeoutMs}ms`);
    },
  };

  let stopped = false;
  const stack = {
    fakeHost: fake.info,
    gatewayUrl,
    appUrl: `http://127.0.0.1:${webPort}`,
    control,
    /** Output of every child, for attaching to a failure message. */
    logs: () => procs.map((p) => p.output()).join('\n'),
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await Promise.all(procs.map((p) => p.kill()));
    },
  };

  return stack;
}
