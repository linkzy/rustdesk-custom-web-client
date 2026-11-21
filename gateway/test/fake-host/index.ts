import path from 'node:path';
import fs from 'node:fs';
import type WebSocket from 'ws';
import { FakeServers, type RelayPair } from './servers';
import { FakeHostSession, type InputEvent, type SessionStats } from './session';
import { ControlServer } from './control';
import { DEFAULTS, SCREEN, deterministicKeypair, type FakeHostOptions } from './config';

export interface FakeHost {
  /** Where the gateway should be pointed. */
  readonly options: FakeHostOptions;
  /** Port the control API actually bound (differs from options when it was 0). */
  actualControlPort(): number;
  /** Live session stats, or null before the first connection. */
  sessionStats(): SessionStats | null;
  /** Input events the "host" received, oldest first. */
  events(type?: 'mouse' | 'key'): InputEvent[];
  clearEvents(): void;
  /** Resolves once the gateway side has completed the login handshake. */
  waitForAuthenticated(timeoutMs?: number): Promise<SessionStats>;
  /** Resolves once at least `count` video frames have been sent. */
  waitForFrames(count: number, timeoutMs?: number): Promise<SessionStats>;
  stop(): Promise<void>;
}

export interface StartOptions extends Partial<FakeHostOptions> {
  /** Replay this clip instead of the shipped one. */
  videoBytes?: Uint8Array;
  /** Replay this .ivf file instead of the shipped one. */
  videoFile?: string;
  log?: (msg: string) => void;
}

const DEFAULT_VIDEO = path.resolve(__dirname, 'assets', 'screen.ivf');

/**
 * Starts the whole fake stack (hbbs + hbbr + control API + session) in this
 * process and returns a handle. The CLI wraps this; tests use it directly so
 * they can run a real gateway against it on ephemeral ports.
 */
export async function startFakeHost(opts: StartOptions = {}): Promise<FakeHost> {
  const options: FakeHostOptions = { ...DEFAULTS, ...opts };
  const log = opts.log ?? (() => {});
  const startedAt = Date.now();

  const hostKeys = deterministicKeypair(1);

  let session: FakeHostSession | null = null;
  let pairedPeer: WebSocket | null = null;

  const eventLog: InputEvent[] = [];
  const recordEvent = (event: InputEvent) => {
    eventLog.push(event);
    if (eventLog.length > options.eventBufferSize) {
      eventLog.splice(0, eventLog.length - options.eventBufferSize);
    }
    // The HTTP API reads its own buffer; keep both views identical so the
    // in-memory helper and /fake/events can never disagree.
    control.record(event);
  };

  const control = new ControlServer(
    { port: options.controlPort, eventBufferSize: options.eventBufferSize, log },
    () => ({ id: options.id, session: session?.stats ?? null, startedAt }),
  );

  const servers = new FakeServers({
    id: options.id,
    hbbsPort: options.hbbsPort,
    hbbrPort: options.hbbrPort,
    peerPk: hostKeys.publicKey,
    log,
  });

  servers.onRelayAssigned = (uuid) => {
    // A real host is told by hbbs to join hbbr; do the same, then wait for the
    // relay to pair us before speaking.
    servers.connectPeer(uuid).then((ws) => {
      pairedPeer = ws;
    }).catch((e: Error) => log(`[peer] join failed: ${e.message}`));
  };

  servers.onPaired = ({ peerClient }: RelayPair) => {
    if (!peerClient) {
      log('[host] paired without a peer client socket; cannot start a session');
      return;
    }
    log('[host] paired with the gateway; starting the session');
    session?.stop('superseded by a new connection');
    session = new FakeHostSession(peerClient, {
      id: options.id,
      password: options.password,
      acceptAnyPassword: options.acceptAnyPassword,
      audio: options.audio,
      videoFile: opts.videoFile ?? DEFAULT_VIDEO,
      videoBytes: opts.videoBytes,
      log,
      onInput: recordEvent,
    });
    session.start().catch((e: Error) => log(`[host] session start failed: ${e.message}`));
  };

  await control.start();
  await servers.start();

  const host: FakeHost = {
    options,
    actualControlPort: () => control.port,
    sessionStats: () => session?.stats ?? null,
    events: (type) => (type ? eventLog.filter((e) => e.type === type) : [...eventLog]),
    clearEvents: () => {
      eventLog.length = 0;
      control.clear();
    },
    waitForAuthenticated: (timeoutMs = 10000) =>
      pollUntil(() => session && session.stats.state !== 'handshaking'
        && session.stats.state !== 'closed' ? session.stats : null, timeoutMs, 'authentication'),
    waitForFrames: (count, timeoutMs = 20000) =>
      pollUntil(() => session && session.stats.framesSent >= count ? session.stats : null, timeoutMs, `${count} frames`),
    stop: async () => {
      session?.stop('shutting down');
      pairedPeer?.terminate();
      await control.stop();
      await servers.stop();
    },
  };

  if (opts.log) {
    opts.log(`[fake-host] ready id=${options.id} hbbs=${options.hbbsPort} hbbr=${options.hbbrPort} control=${options.controlPort}`);
    opts.log(`[fake-host] screen ${SCREEN.width}x${SCREEN.height} @ ${SCREEN.fps} fps VP9`);
  }

  return host;
}

async function pollUntil<T>(fn: () => T | null, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`[fake-host] timed out after ${timeoutMs}ms waiting for ${what}`);
}
