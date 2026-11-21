import http from 'http';
import type { InputEvent, SessionStats } from './session';

export interface ControlServerOptions {
  port: number;
  eventBufferSize: number;
  log: (msg: string) => void;
}

export interface ControlState {
  id: string;
  session: SessionStats | null;
  /** Wall-clock start of the process, so a test can tell restarts apart. */
  startedAt: number;
}

/**
 * The fake host's localhost-only control API. Tests and the recording script
 * use it to answer "did my click actually reach the host?" without reading the
 * gateway's logs.
 *
 *   GET /fake/state   → { id, session, startedAt }
 *   GET /fake/events  → { count, events: InputEvent[] }   (oldest → newest)
 *   GET /fake/events?type=mouse&limit=5
 *   POST /fake/events/reset → clears the buffer
 *   GET /fake/health  → { ok: true }
 */
export class ControlServer {
  private readonly opts: ControlServerOptions;
  private server: http.Server | null = null;
  private events: InputEvent[] = [];
  private getState: () => ControlState;

  constructor(opts: ControlServerOptions, getState: () => ControlState) {
    this.opts = opts;
    this.getState = getState;
  }

  record(event: InputEvent): void {
    this.events.push(event);
    if (this.events.length > this.opts.eventBufferSize) {
      this.events.splice(0, this.events.length - this.opts.eventBufferSize);
    }
  }

  /** Empties the buffer; used by POST /fake/events and the in-memory helper. */
  clear(): void {
    this.events = [];
  }

  /** The port actually bound (resolved when the configured port was 0). */
  get port(): number {
    const address = this.server?.address();
    return typeof address === 'object' && address ? address.port : this.opts.port;
  }

  async start(): Promise<void> {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');

      if (url.pathname === '/fake/health') {
        json(res, 200, { ok: true });
        return;
      }

      if (url.pathname === '/fake/state') {
        json(res, 200, this.getState());
        return;
      }

      if (url.pathname === '/fake/events' && req.method === 'POST') {
        // The only mutating call: let a test start from a clean slate between
        // steps instead of diffing sequence numbers.
        this.events = [];
        json(res, 200, { ok: true, count: 0 });        return;
      }

      if (url.pathname === '/fake/events') {
        const type = url.searchParams.get('type');
        const limit = Number(url.searchParams.get('limit') ?? '') || 0;
        let events = type ? this.events.filter((e) => e.type === type) : this.events;
        if (limit > 0) events = events.slice(-limit);
        json(res, 200, { count: events.length, events });
        return;
      }

      json(res, 404, { error: 'not found', paths: ['/fake/state', '/fake/events', '/fake/health'] });
    });

    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.opts.port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.opts.log(`[control] http://127.0.0.1:${this.opts.port}/fake/state`);
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status);
  res.end(JSON.stringify(body));
}
