import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGateway, type GatewayControls, type GatewayState } from './useGateway';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A WebSocket stand-in. Tests drive it: open(), receive(), drop().
class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  binaryType = '';

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  // Like a browser, close() does not fire onclose synchronously.
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  // Network drop: the browser fires close with an abnormal code.
  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
}

let latest: [GatewayState, GatewayControls] | null = null;
function Probe() {
  const result = useGateway();
  useEffect(() => {
    latest = result;
  });
  return null;
}

const state = () => latest![0];
const controls = () => latest![1];
const sockets = () => FakeSocket.instances;
const last = () => FakeSocket.instances[FakeSocket.instances.length - 1];

// Opens the first socket and sends the `connected` frame, so the session is "in progress".
function connectSession(captchaToken?: string) {
  act(() => controls().connect('123', 'pw', undefined, captchaToken));
  act(() => last().open());
  act(() => last().receive({ type: 'connected', width: 800, height: 600, codec: 'vp9' }));
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  latest = null;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(createElement(Probe));
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('useGateway automatic reconnect', () => {
  it('retries after an unexpected close during a session and re-sends the connect payload', () => {
    connectSession();
    act(() => last().drop());

    expect(state().status).toBe('reconnecting');
    expect(state().reconnect?.attempt).toBe(1);
    expect(sockets()).toHaveLength(1);

    advance(1000);
    expect(sockets()).toHaveLength(2);
    act(() => last().open());

    const sent = JSON.parse(last().sent[0]);
    expect(sent).toMatchObject({ type: 'connect', targetId: '123', password: 'pw' });
  });

  it('does not retry after the user disconnects', () => {
    connectSession();
    act(() => last().drop());
    expect(state().status).toBe('reconnecting');

    act(() => controls().disconnect());
    advance(60_000);

    expect(sockets()).toHaveLength(1);
    expect(state().status).toBe('idle');
    expect(state().reconnect).toBeNull();
  });

  it('does not retry after the gateway reports an error on a retried socket', () => {
    connectSession();
    act(() => last().drop());
    advance(1000);
    act(() => last().open());
    act(() => last().receive({ type: 'error', message: 'wrong password' }));
    act(() => last().drop());
    advance(60_000);

    expect(sockets()).toHaveLength(2);
    expect(state().status).toBe('error');
    expect(state().error).toBe('wrong password');
  });

  it('does not retry after the gateway sends disconnected', () => {
    connectSession();
    act(() => last().receive({ type: 'disconnected' }));
    act(() => last().drop());
    advance(60_000);

    expect(sockets()).toHaveLength(1);
    expect(state().status).toBe('disconnected');
  });

  it('does not retry a session that was started with a captcha token', () => {
    connectSession('captcha-token');
    act(() => last().drop());
    advance(60_000);

    expect(sockets()).toHaveLength(1);
    expect(state().status).toBe('disconnected');
    expect(state().reconnect).toBeNull();
  });

  it('ignores close events from a socket that has been replaced', () => {
    connectSession();
    const old = last();
    act(() => controls().connect('123', 'pw'));
    expect(state().status).toBe('connecting');

    // The old socket's close arrives late; it must not schedule a retry.
    act(() => old.drop());
    advance(60_000);

    expect(state().status).toBe('connecting');
    expect(sockets()).toHaveLength(2);
  });

  it('waits for the online event instead of retrying while the browser is offline', () => {
    connectSession();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    act(() => last().drop());
    advance(1000);

    expect(sockets()).toHaveLength(1);
    expect(state().status).toBe('reconnecting');
    expect(state().reconnect?.offline).toBe(true);

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(sockets()).toHaveLength(2);
    expect(state().reconnect?.offline).toBe(false);
  });
});
