import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';

export interface GatewayState {
  status: ConnectionStatus;
  error: string | null;
  remoteWidth: number;
  remoteHeight: number;
  codec: string | null;
  logs: string[];
}

export interface GatewayControls {
  connect: (targetId: string, password: string) => void;
  disconnect: () => void;
  sendMouse: (x: number, y: number, mask: number, modifiers?: string[]) => void;
  sendKey: (down: boolean, key: string, keyCode: number, modifiers?: string[]) => void;
  onVideoFrame: (handler: (data: ArrayBuffer) => void) => void;
  addLog: (msg: string) => void;
}

const GATEWAY_WS_URL = '/ws';
const MAX_LOGS = 200;

function ts() {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

export function useGateway(): [GatewayState, GatewayControls] {
  const wsRef = useRef<WebSocket | null>(null);
  const videoHandlerRef = useRef<((data: ArrayBuffer) => void) | null>(null);

  const [state, setState] = useState<GatewayState>({
    status: 'idle',
    error: null,
    remoteWidth: 0,
    remoteHeight: 0,
    codec: null,
    logs: [],
  });

  const addLog = useCallback((msg: string) => {
    setState((s) => ({ ...s, logs: [...s.logs.slice(-(MAX_LOGS - 1)), `[${ts()}] ${msg}`] }));
  }, []);

  const connect = useCallback((targetId: string, password: string) => {
    if (wsRef.current) wsRef.current.close();

    setState((s) => ({ ...s, status: 'connecting', error: null }));
    addLog(`connect → targetId=${targetId}`);

    const ws = new WebSocket(GATEWAY_WS_URL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      addLog('WS open, sending connect');
      ws.send(JSON.stringify({ type: 'connect', targetId, password }));
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
          } else if (msg.type === 'error') {
            addLog(`error: ${msg.message}`);
            setState((s) => ({ ...s, status: 'error', error: msg.message }));
          } else if (msg.type === 'disconnected') {
            addLog('disconnected by gateway');
            setState((s) => ({ ...s, status: 'disconnected' }));
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
      setState((s) =>
        s.status === 'connected' ? { ...s, status: 'disconnected' } : s
      );
    };

    ws.onerror = () => {
      addLog('WS error');
      setState((s) => ({ ...s, status: 'error', error: 'WebSocket connection failed' }));
    };
  }, [addLog]);

  const disconnect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'disconnect' }));
      wsRef.current.close();
    }
    setState((s) => ({ ...s, status: 'idle' }));
  }, []);

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
    return () => { wsRef.current?.close(); };
  }, []);

  return [
    state,
    { connect, disconnect, sendMouse, sendKey, onVideoFrame, addLog },
  ];
}
