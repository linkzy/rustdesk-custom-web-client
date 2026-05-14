import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';

export interface GatewayState {
  status: ConnectionStatus;
  error: string | null;
  remoteWidth: number;
  remoteHeight: number;
  codec: string | null;
}

export interface GatewayControls {
  connect: (targetId: string, password: string) => void;
  disconnect: () => void;
  sendMouse: (x: number, y: number, mask: number, modifiers?: string[]) => void;
  sendKey: (down: boolean, key: string, keyCode: number, modifiers?: string[]) => void;
  onVideoFrame: (handler: (data: ArrayBuffer) => void) => void;
}

const GATEWAY_WS_URL = '/ws'; // proxied by Vite dev server to ws://localhost:4000

export function useGateway(): [GatewayState, GatewayControls] {
  const wsRef = useRef<WebSocket | null>(null);
  const videoHandlerRef = useRef<((data: ArrayBuffer) => void) | null>(null);

  const [state, setState] = useState<GatewayState>({
    status: 'idle',
    error: null,
    remoteWidth: 0,
    remoteHeight: 0,
    codec: null,
  });

  const connect = useCallback((targetId: string, password: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setState((s) => ({ ...s, status: 'connecting', error: null }));

    const ws = new WebSocket(GATEWAY_WS_URL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'connect', targetId, password }));
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary = video frame
        videoHandlerRef.current?.(event.data);
      } else {
        // Text = JSON status message
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'connected') {
            setState((s) => ({
              ...s,
              status: 'connected',
              remoteWidth: msg.width,
              remoteHeight: msg.height,
              codec: msg.codec,
              error: null,
            }));
          } else if (msg.type === 'error') {
            setState((s) => ({ ...s, status: 'error', error: msg.message }));
          } else if (msg.type === 'disconnected') {
            setState((s) => ({ ...s, status: 'disconnected' }));
          }
        } catch (e) {
          console.error('[useGateway] Failed to parse message:', e);
        }
      }
    };

    ws.onclose = () => {
      setState((s) =>
        s.status === 'connected' ? { ...s, status: 'disconnected' } : s
      );
    };

    ws.onerror = () => {
      setState((s) => ({ ...s, status: 'error', error: 'WebSocket connection failed' }));
    };
  }, []);

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
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return [
    state,
    { connect, disconnect, sendMouse, sendKey, onVideoFrame },
  ];
}
