import { useEffect, useRef } from 'react';
import { VideoFrameDecoder } from '../video/decoder';
import { OpusAudioPlayer } from '../video/audio';
import type { GatewayControls, GatewayState } from '../hooks/useGateway';
import styles from './RemoteScreen.module.css';

const CODEC_AUDIO = 5;

interface RemoteScreenProps {
  state: GatewayState;
  controls: GatewayControls;
  onLog?: (msg: string) => void;
  fitToWindow?: boolean;
}

export function RemoteScreen({ state, controls, onLog, fitToWindow = true }: RemoteScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const decoderRef = useRef<VideoFrameDecoder | null>(null);
  const audioRef = useRef<OpusAudioPlayer | null>(null);

  // Stable refs so all effects run once but always see latest values
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const stateRef = useRef(state);
  stateRef.current = state;
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  const log = (msg: string) => {
    console.log('[input]', msg);
    onLogRef.current?.(msg);
  };

  // Video + audio decoders — run once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const decoder = new VideoFrameDecoder(
      (frame) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
          canvas.width = frame.displayWidth;
          canvas.height = frame.displayHeight;
        }
        ctx.drawImage(frame, 0, 0);
      },
      (stats) => controlsRef.current.updateFrameStats(stats),
    );
    decoderRef.current = decoder;

    // Opus audio player. Only plays when the browser supports WebCodecs AudioDecoder.
    let audioLoggedFormat = false;
    const audio = new OpusAudioPlayer((st) => {
      if (st.streaming && st.sampleRate && !audioLoggedFormat) {
        audioLoggedFormat = true;
        controlsRef.current.addLog(`audio: ${st.sampleRate} Hz, ${st.channels} ch`);
      }
    });
    audioRef.current = audio;

    // Host announces the audio format (sample_rate/channels) via Misc.audio_format.
    controlsRef.current.onAudioFormat((fmt) => {
      audio.setFormat(fmt.sampleRate, fmt.channels);
    });

    // Binary frames from the gateway: marker byte 5 = Opus audio, otherwise video.
    controlsRef.current.onVideoFrame((data) => {
      const bytes = new Uint8Array(data);
      if (bytes.length > 0 && bytes[0] === CODEC_AUDIO) {
        audio.handleFrame(data);
        return;
      }
      decoder.handleFrame(data);
    });

    return () => {
      audio.stop();
      audioRef.current = null;
      decoder.close();
      decoderRef.current = null;
    };
  }, []);

  // All input: native DOM listeners, run once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toCoords = (clientX: number, clientY: number) => {
      const s = stateRef.current;
      if (!canvas || !s.remoteWidth || !s.remoteHeight) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.round((clientX - rect.left) * (s.remoteWidth / rect.width)),
        y: Math.round((clientY - rect.top) * (s.remoteHeight / rect.height)),
      };
    };

    const getMods = (e: MouseEvent | KeyboardEvent): string[] => {
      const m: string[] = [];
      if (e.ctrlKey)  m.push('ctrl');
      if (e.altKey)   m.push('alt');
      if (e.shiftKey) m.push('shift');
      if (e.metaKey)  m.push('meta');
      return m;
    };

    // RustDesk mask = (button << 3) | event_type
    // event_type: 0=move, 1=down, 2=up, 3=wheel
    // button: 0x01=left, 0x02=right, 0x04=middle
    const MOUSE_TYPE_DOWN  = 1;
    const MOUSE_TYPE_UP    = 2;
    const MOUSE_TYPE_WHEEL = 3;
    // Map browser button index → RustDesk button bit
    const BUTTON_MAP: Record<number, number> = { 0: 0x01, 1: 0x04, 2: 0x02 };

    // Mouse
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const { x, y } = toCoords(e.clientX, e.clientY);
      const btn = BUTTON_MAP[e.button] ?? 0x01;
      const mask = (btn << 3) | MOUSE_TYPE_DOWN;
      log(`mousedown btn=${e.button} mask=${mask} x=${x} y=${y}`);
      controlsRef.current.sendMouse(x, y, mask, getMods(e));
    };

    const onMouseMove = (e: MouseEvent) => {
      const { x, y } = toCoords(e.clientX, e.clientY);
      controlsRef.current.sendMouse(x, y, 0, []); // mask=0 = move
    };

    // mouseup on document catches release even if pointer left the canvas
    const onMouseUp = (e: MouseEvent) => {
      const { x, y } = toCoords(e.clientX, e.clientY);
      const btn = BUTTON_MAP[e.button] ?? 0x01;
      const mask = (btn << 3) | MOUSE_TYPE_UP;
      log(`mouseup btn=${e.button} mask=${mask} x=${x} y=${y}`);
      controlsRef.current.sendMouse(x, y, mask, getMods(e));
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Browser deltaY: positive = scroll down. RustDesk y: positive = scroll up
      // (Windows MOUSEEVENTF_WHEEL convention). Invert to match.
      const scrollY = e.deltaY > 0 ? -1 : 1;
      controlsRef.current.sendMouse(0, scrollY, MOUSE_TYPE_WHEEL, getMods(e));
    };

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      log(`keydown key="${e.key}" keyCode=${e.keyCode}`);
      controlsRef.current.sendKey(true, e.key, e.keyCode, getMods(e));
    };

    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      controlsRef.current.sendKey(false, e.key, e.keyCode, getMods(e));
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, []); // empty deps — refs provide latest values without re-running

  const rw = state.remoteWidth || 1920;
  const rh = state.remoteHeight || 1080;

  return (
    <div ref={containerRef} className={fitToWindow ? styles.containerFit : styles.containerNative}>
      <canvas
        ref={canvasRef}
        className={fitToWindow ? styles.canvasFit : styles.canvasNative}
        width={rw}
        height={rh}
        style={fitToWindow ? { aspectRatio: `${rw} / ${rh}` } : undefined}
      />
    </div>
  );
}
