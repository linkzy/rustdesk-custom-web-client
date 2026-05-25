import { useCallback, useEffect, useRef, useState } from 'react';
import type { DecoderStats } from '../video/decoder';
import type { ServerConfig } from '../components/ConnectForm';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';


export interface ConnectionStats {
  fps: number;
  gwFps: number;        // frames per second received by gateway from relay
  frameIntervalMs: number;
  decodeTimeMs: number;
  pingMs: number | null;
  lastFrameAt: number;
}

export interface GatewayState {
  status: ConnectionStatus;
  error: string | null;
  remoteWidth: number;
  remoteHeight: number;
  codec: string | null;
  logs: string[];
  stats: ConnectionStats;
}

export interface GatewayControls {
  connect: (targetId: string, password: string, serverConfig?: ServerConfig) => void;
  disconnect: () => void;
  sendMouse: (x: number, y: number, mask: number, modifiers?: string[]) => void;
  sendKey: (down: boolean, key: string, keyCode: number, modifiers?: string[]) => void;
  onVideoFrame: (handler: (data: ArrayBuffer) => void) => void;
  addLog: (msg: string) => void;
  updateFrameStats: (s: DecoderStats) => void;
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
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<GatewayState>({
    status: 'idle',
    error: null,
    remoteWidth: 0,
    remoteHeight: 0,
    codec: null,
    logs: [],
    stats: DEFAULT_STATS,
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

  const connect = useCallback((targetId: string, password: string, serverConfig?: ServerConfig) => {
    if (wsRef.current) wsRef.current.close();
    stopPing();

    setState((s) => ({ ...s, status: 'connecting', error: null, stats: DEFAULT_STATS }));
    addLog(`connect → targetId=${targetId}`);

    const ws = new WebSocket(GATEWAY_WS_URL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      addLog('WS open, sending connect');
      ws.send(JSON.stringify({ type: 'connect', targetId, password, serverConfig }));
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        videoHandlerRef.current?.(event.data);
      } else {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'connected') {
            addLog(`connected ${msg.width}x${msg.height} codec=${msg.codec}`);
            setState((s) => ({
              ...s,
              status: 'connected',
              remoteWidth: msg.width,
              remoteHeight: msg.height,
              codec: msg.codec,
              error: null,
            }));
            startPing();
          } else if (msg.type === 'gw_stats') {
            setState((s) => ({ ...s, stats: { ...s.stats, gwFps: msg.gwFps ?? 0 } }));
          } else if (msg.type === 'pong') {
            const pingMs = Math.round(performance.now() - msg.ts);
            setState((s) => ({ ...s, stats: { ...s.stats, pingMs } }));
          } else if (msg.type === 'error') {
            addLog(`error: ${msg.message}`);
            setState((s) => ({ ...s, status: 'error', error: msg.message }));
          } else if (msg.type === 'disconnected') {
            addLog('disconnected by gateway');
            setState((s) => ({ ...s, status: 'disconnected' }));
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
      addLog(`WS closed code=${e.code}`);
      stopPing();
      setState((s) =>
        s.status === 'connected' ? { ...s, status: 'disconnected' } : s
      );
    };

    ws.onerror = () => {
      addLog('WS error');
      stopPing();
      setState((s) => ({ ...s, status: 'error', error: 'WebSocket connection failed' }));
    };
  }, [addLog, startPing, stopPing]);

  const disconnect = useCallback(() => {
    stopPing();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'disconnect' }));
      wsRef.current.close();
    }
    setState((s) => ({ ...s, status: 'idle', stats: DEFAULT_STATS }));
  }, [stopPing]);

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

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      stopPing();
    };
  }, [stopPing]);

  return [
    state,
    { connect, disconnect, sendMouse, sendKey, onVideoFrame, addLog, updateFrameStats },
  ];
}
