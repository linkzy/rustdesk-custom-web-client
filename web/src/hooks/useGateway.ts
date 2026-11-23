import { useCallback, useEffect, useRef, useState } from 'react';
import type { DecoderStats } from '../video/decoder';
import type { ServerConfig } from '../components/ConnectForm';
import { reconnectDelayMs, RECONNECT_MAX_ATTEMPTS } from '../utils/reconnect';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected' | 'reconnecting';


export interface ConnectionStats {
  fps: number;
  gwFps: number;        // frames per second received by gateway from relay
  frameIntervalMs: number;
  decodeTimeMs: number;
  pingMs: number | null;
  lastFrameAt: number;
}

export interface ReconnectInfo {
  attempt: number;
  max: number;
  nextAt: number | null;  // epoch ms of the next attempt; null while one is in flight
  offline: boolean;       // browser has no network; waiting for the `online` event
}

export interface GatewayState {
  status: ConnectionStatus;
  error: string | null;
  remoteWidth: number;
  remoteHeight: number;
  codec: string | null;
  logs: string[];
  stats: ConnectionStats;
  reconnect: ReconnectInfo | null;
}

export interface GatewayControls {
  connect: (targetId: string, password: string, serverConfig?: ServerConfig, captchaToken?: string) => void;
  disconnect: () => void;
  sendMouse: (x: number, y: number, mask: number, modifiers?: string[]) => void;
  sendKey: (down: boolean, key: string, keyCode: number, modifiers?: string[]) => void;
  onVideoFrame: (handler: (data: ArrayBuffer) => void) => void;
  onAudioFormat: (handler: (format: { sampleRate: number; channels: number }) => void) => void;
  addLog: (msg: string) => void;
  updateFrameStats: (s: DecoderStats) => void;
}

interface ConnectArgs {
  targetId: string;
  password: string;
  serverConfig?: ServerConfig;
  captchaToken?: string;
}

const GATEWAY_WS_URL = '/ws';
const MAX_LOGS = 200;
const PING_INTERVAL_MS = 3000;

function ts() {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

const DEFAULT_STATS: ConnectionStats = {
  fps: 0,
  gwFps: 0,
  frameIntervalMs: 0,
  decodeTimeMs: 0,
  pingMs: null,
  lastFrameAt: 0,
};

export function useGateway(): [GatewayState, GatewayControls] {
  const wsRef = useRef<WebSocket | null>(null);
  const videoHandlerRef = useRef<((data: ArrayBuffer) => void) | null>(null);
  const audioFormatHandlerRef = useRef<((format: { sampleRate: number; channels: number }) => void) | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-reconnect state. lastConnectRef is the payload to re-send; it is cleared
  // by every path that must not retry (user disconnect, gateway error, unmount).
  const lastConnectRef = useRef<ConnectArgs | null>(null);
  const connectedRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingOnlineRef = useRef(false);
  const openSocketRef = useRef<() => void>(() => {});

  const [state, setState] = useState<GatewayState>({
    status: 'idle',
    error: null,
    remoteWidth: 0,
    remoteHeight: 0,
    codec: null,
    logs: [],
    stats: DEFAULT_STATS,
    reconnect: null,
  });

  const addLog = useCallback((msg: string) => {
    setState((s) => ({ ...s, logs: [...s.logs.slice(-(MAX_LOGS - 1)), `[${ts()}] ${msg}`] }));
  }, []);

  const updateFrameStats = useCallback((decoderStats: DecoderStats) => {
    setState((s) => ({
      ...s,
      stats: {
        ...s.stats,
        fps: decoderStats.fps,
        frameIntervalMs: decoderStats.frameIntervalMs,
        decodeTimeMs: decoderStats.decodeTimeMs,
        lastFrameAt: decoderStats.lastFrameAt,
      },
    }));
  }, []);

  const startPing = useCallback(() => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', ts: performance.now() }));
      }
    }, PING_INTERVAL_MS);
  }, []);

  const stopPing = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    waitingOnlineRef.current = false;
  }, []);

  // True when an unexpected close should be retried: a session was in progress
  // (or a retry is already underway) and nothing has told us to stop. A payload
  // that carries an hCaptcha token is never retried: the token is single-use, so
  // a re-sent payload would fail at the gateway and the user has to solve it again.
  const canRetry = useCallback(
    () =>
      lastConnectRef.current !== null &&
      !lastConnectRef.current.captchaToken &&
      (connectedRef.current || retryAttemptRef.current > 0),
    [],
  );

  const scheduleRetry = useCallback(() => {
    const attempt = retryAttemptRef.current + 1;
    const delay = reconnectDelayMs(attempt);
    if (delay === null) {
      addLog(`reconnect gave up after ${RECONNECT_MAX_ATTEMPTS} attempts`);
      lastConnectRef.current = null;
      retryAttemptRef.current = 0;
      setState((s) => ({ ...s, status: 'disconnected', reconnect: null }));
      return;
    }
    retryAttemptRef.current = attempt;
    addLog(`reconnect attempt ${attempt}/${RECONNECT_MAX_ATTEMPTS} in ${delay / 1000}s`);
    setState((s) => ({
      ...s,
      status: 'reconnecting',
      reconnect: { attempt, max: RECONNECT_MAX_ATTEMPTS, nextAt: Date.now() + delay, offline: false },
    }));
    clearRetry();
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (navigator.onLine === false) {
        // Don't burn the wait on a dead network: resume when the browser says it is back.
        waitingOnlineRef.current = true;
        addLog('browser offline, waiting for the network');
        setState((s) => ({ ...s, reconnect: s.reconnect && { ...s.reconnect, nextAt: null, offline: true } }));
        return;
      }
      setState((s) => ({ ...s, reconnect: s.reconnect && { ...s.reconnect, nextAt: null } }));
      openSocketRef.current();
    }, delay);
  }, [addLog, clearRetry]);

  // Opens a socket and sends the stored connect payload when it opens. Used for
  // the first attempt and for every automatic retry.
  const openSocket = useCallback(() => {
    const args = lastConnectRef.current;
    if (!args) return;

    if (wsRef.current) wsRef.current.close();
    stopPing();

    const ws = new WebSocket(GATEWAY_WS_URL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      addLog('WS open, sending connect');
      ws.send(JSON.stringify({ type: 'connect', ...args }));
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      if (event.data instanceof ArrayBuffer) {
        videoHandlerRef.current?.(event.data);
      } else {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'connected') {
            addLog(`connected ${msg.width}x${msg.height} codec=${msg.codec}`);
            connectedRef.current = true;
            retryAttemptRef.current = 0;
            setState((s) => ({
              ...s,
              status: 'connected',
              remoteWidth: msg.width,
              remoteHeight: msg.height,
              codec: msg.codec,
              error: null,
              reconnect: null,
            }));
            startPing();
          } else if (msg.type === 'gw_stats') {
            setState((s) => ({ ...s, stats: { ...s.stats, gwFps: msg.gwFps ?? 0 } }));
          } else if (msg.type === 'audio_format') {
            audioFormatHandlerRef.current?.({ sampleRate: msg.sampleRate, channels: msg.channels });
          } else if (msg.type === 'pong') {
            const pingMs = Math.round(performance.now() - msg.ts);
            setState((s) => ({ ...s, stats: { ...s.stats, pingMs } }));
          } else if (msg.type === 'error') {
            // Gateway-reported errors (wrong password, offline host, captcha) are
            // not network drops: stop retrying so a bad password never loops.
            addLog(`error: ${msg.message}`);
            lastConnectRef.current = null;
            clearRetry();
            retryAttemptRef.current = 0;
            setState((s) => ({ ...s, status: 'error', error: msg.message, reconnect: null }));
          } else if (msg.type === 'disconnected') {
            addLog('disconnected by gateway');
            lastConnectRef.current = null;
            clearRetry();
            setState((s) => ({ ...s, status: 'disconnected', reconnect: null }));
            stopPing();
          } else if (msg.type === 'log') {
            addLog(`[gw] ${msg.message}`);
          }
        } catch (e) {
          console.error('[useGateway] Failed to parse message:', e);
        }
      }
    };

    ws.onclose = (e) => {
      if (wsRef.current !== ws) return;
      addLog(`WS closed code=${e.code}`);
      stopPing();
      if (canRetry()) {
        scheduleRetry();
        return;
      }
      setState((s) => (s.status === 'connected' ? { ...s, status: 'disconnected' } : s));
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      addLog('WS error');
      stopPing();
      // onclose follows and decides whether to retry; only report the error for a
      // first attempt that cannot be retried.
      if (!canRetry()) {
        setState((s) => ({ ...s, status: 'error', error: 'WebSocket connection failed' }));
      }
    };
  }, [addLog, canRetry, clearRetry, scheduleRetry, startPing, stopPing]);

  useEffect(() => {
    openSocketRef.current = openSocket;
  }, [openSocket]);

  // Resume a retry that was waiting for the browser to come back online.
  useEffect(() => {
    const onOnline = () => {
      if (!waitingOnlineRef.current) return;
      waitingOnlineRef.current = false;
      addLog('browser online, reconnecting now');
      setState((s) => ({ ...s, reconnect: s.reconnect && { ...s.reconnect, nextAt: null, offline: false } }));
      openSocketRef.current();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [addLog]);

  const connect = useCallback((targetId: string, password: string, serverConfig?: ServerConfig, captchaToken?: string) => {
    clearRetry();
    retryAttemptRef.current = 0;
    connectedRef.current = false;
    lastConnectRef.current = { targetId, password, serverConfig, captchaToken };

    setState((s) => ({ ...s, status: 'connecting', error: null, reconnect: null, stats: DEFAULT_STATS }));
    addLog(`connect → targetId=${targetId}`);
    openSocket();
  }, [addLog, clearRetry, openSocket]);

  const disconnect = useCallback(() => {
    // Forget the payload first so the close that follows never schedules a retry.
    lastConnectRef.current = null;
    clearRetry();
    retryAttemptRef.current = 0;
    connectedRef.current = false;
    stopPing();
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'disconnect' }));
    }
    ws?.close();
    setState((s) => ({ ...s, status: 'idle', reconnect: null, stats: DEFAULT_STATS }));
  }, [clearRetry, stopPing]);

  const sendMouse = useCallback((x: number, y: number, mask: number, modifiers: string[] = []) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mouse', x, y, mask, modifiers }));
    }
  }, []);

  const sendKey = useCallback((down: boolean, key: string, keyCode: number, modifiers: string[] = []) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'key', down, key, keyCode, modifiers }));
    }
  }, []);

  const onVideoFrame = useCallback((handler: (data: ArrayBuffer) => void) => {
    videoHandlerRef.current = handler;
  }, []);

  const onAudioFormat = useCallback((handler: (format: { sampleRate: number; channels: number }) => void) => {
    audioFormatHandlerRef.current = handler;
  }, []);

  useEffect(() => {
    return () => {
      // Unmounting must not leave a retry timer or a retrying socket behind.
      lastConnectRef.current = null;
      clearRetry();
      wsRef.current?.close();
      stopPing();
    };
  }, [clearRetry, stopPing]);

  return [
    state,
    { connect, disconnect, sendMouse, sendKey, onVideoFrame, onAudioFormat, addLog, updateFrameStats },
  ];
}
