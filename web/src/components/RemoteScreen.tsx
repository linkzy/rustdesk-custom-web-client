import { useEffect, useRef, useCallback } from 'react';
import { VideoFrameDecoder } from '../video/decoder';
import type { GatewayControls, GatewayState } from '../hooks/useGateway';
import styles from './RemoteScreen.module.css';

interface RemoteScreenProps {
  state: GatewayState;
  controls: GatewayControls;
}

export function RemoteScreen({ state, controls }: RemoteScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const decoderRef = useRef<VideoFrameDecoder | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const decoder = new VideoFrameDecoder((frame) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
        canvas.width = frame.displayWidth;
        canvas.height = frame.displayHeight;
      }
      ctx.drawImage(frame, 0, 0);
    });
    decoderRef.current = decoder;

    controls.onVideoFrame((data) => decoder.handleFrame(data));

    return () => {
      decoder.close();
      decoderRef.current = null;
    };
  }, [controls]);

  // Document-level keyboard listeners — avoids focus management issues entirely.
  // All key events go to the remote while connected.
  useEffect(() => {
    const getKbModifiers = (e: KeyboardEvent): string[] => {
      const mods: string[] = [];
      if (e.ctrlKey)  mods.push('ctrl');
      if (e.altKey)   mods.push('alt');
      if (e.shiftKey) mods.push('shift');
      if (e.metaKey)  mods.push('meta');
      return mods;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      controls.sendKey(true, e.key, e.keyCode, getKbModifiers(e));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      controls.sendKey(false, e.key, e.keyCode, getKbModifiers(e));
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [controls]);

  const toRemoteCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas || !state.remoteWidth || !state.remoteHeight) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = state.remoteWidth / rect.width;
      const scaleY = state.remoteHeight / rect.height;
      return {
        x: Math.round((clientX - rect.left) * scaleX),
        y: Math.round((clientY - rect.top) * scaleY),
      };
    },
    [state.remoteWidth, state.remoteHeight]
  );

  const getMouseModifiers = (e: React.PointerEvent | React.WheelEvent): string[] => {
    const mods: string[] = [];
    if (e.ctrlKey)  mods.push('ctrl');
    if (e.altKey)   mods.push('alt');
    if (e.shiftKey) mods.push('shift');
    if (e.metaKey)  mods.push('meta');
    return mods;
  };

  // Use pointer events + setPointerCapture so mouseup is always received
  // even if the pointer moves outside the canvas before the button is released.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const { x, y } = toRemoteCoords(e.clientX, e.clientY);
      const buttonMask = e.button === 0 ? 1 : e.button === 2 ? 2 : e.button === 1 ? 4 : 0;
      controls.sendMouse(x, y, buttonMask, getMouseModifiers(e));
    },
    [controls, toRemoteCoords]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const { x, y } = toRemoteCoords(e.clientX, e.clientY);
      controls.sendMouse(x, y, 0, getMouseModifiers(e));
    },
    [controls, toRemoteCoords]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.currentTarget.releasePointerCapture(e.pointerId);
      const { x, y } = toRemoteCoords(e.clientX, e.clientY);
      const buttonMask = e.button === 0 ? 1 : e.button === 2 ? 2 : e.button === 1 ? 4 : 0;
      controls.sendMouse(x, y, buttonMask | 8, getMouseModifiers(e));
    },
    [controls, toRemoteCoords]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const { x, y } = toRemoteCoords(e.clientX, e.clientY);
      const mask = e.deltaY > 0 ? 0x11 : 0x0f;
      controls.sendMouse(x, y, mask, getMouseModifiers(e));
    },
    [controls, toRemoteCoords]
  );

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      ref={containerRef}
      className={styles.container}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        width={state.remoteWidth || 1920}
        height={state.remoteHeight || 1080}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}
