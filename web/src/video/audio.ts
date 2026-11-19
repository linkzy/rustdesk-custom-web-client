import { CODEC_AUDIO, parseFrame } from './frameProtocol';

const hasWebCodecsAudio = typeof AudioDecoder !== 'undefined';
const hasWebAudio = typeof AudioContext !== 'undefined';

export interface AudioFormat {
  sampleRate: number;
  channels: number;
}

export interface AudioState {
  available: boolean;
  streaming: boolean;
  sampleRate: number;
  channels: number;
  lastPacketAt: number;
}

export type AudioStateCallback = (state: AudioState) => void;

// How far ahead (seconds) of the AudioContext clock we schedule buffers.
// Absorbs jitter/network bursts; kept small for low latency.
const SCHEDULE_AHEAD = 0.08;

/**
 * Decodes the Opus audio stream sent by the RustDesk host and plays it back.
 *
 * Wire format from the gateway: [marker=5][flags][...Opus packet bytes].
 * Opus packets are raw RFC 6716 packets (no Ogg/OpusHead container), which
 * WebCodecs `AudioDecoder` handles natively when configured with sampleRate
 * and numberOfChannels (≤ 2, per the W3C codec registration).
 */
export class OpusAudioPlayer {
  private ctx: AudioContext | null = null;
  private outGain: GainNode | null = null;
  private decoder: AudioDecoder | null = null;

  private sampleRate = 48000;
  private channels = 2;

  // Continuous playback clock: the next position in ctx time to start a buffer.
  private nextPlayTime = 0;
  private frameCount = 0;
  private lastPacketAt = 0;

  private state: AudioState = {
    available: hasWebCodecsAudio && hasWebAudio,
    streaming: false,
    sampleRate: 0,
    channels: 0,
    lastPacketAt: 0,
  };

  private onState?: AudioStateCallback;

  constructor(onState?: AudioStateCallback) {
    this.onState = onState;
  }

  setFormat(sampleRate: number, channels: number): void {
    if (!sampleRate || channels < 1 || channels > 2) {
      console.warn(`[audio] Ignoring unsupported format: ${sampleRate} Hz / ${channels} ch`);
      return;
    }
    const changed = this.sampleRate !== sampleRate || this.channels !== channels;
    this.sampleRate = sampleRate;
    this.channels = channels;
    // New format: resync scheduling and rebuild the decoder with fresh state.
    if (changed) {
      this.disposeDecoder();
      this.nextPlayTime = 0;
      this.frameCount = 0;
    }
    this.emit({ sampleRate, channels });
  }

  handleFrame(buffer: ArrayBuffer): void {
    if (!this.state.available) return;

    const parsed = parseFrame(new Uint8Array(buffer));
    if (!parsed || parsed.codecId !== CODEC_AUDIO) return;
    const packet = parsed.payload.slice();
    if (packet.length === 0) return;

    try {
      if (!this.ctx) this.initContext();
      // Resume if suspended (autoplay policy). The context was likely created
      // during a user gesture, which satisfies the policy.
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();

      if (!this.decoder) this.initDecoder();
      this.decoder?.decode(new EncodedAudioChunk({
        type: 'key',
        timestamp: this.frameCount++ * 20_000, // 20ms Opus frame → microseconds
        data: packet,
      }));
    } catch (e) {
      console.error('[audio] Failed to decode packet:', e);
      return;
    }

    this.lastPacketAt = performance.now();
    this.emit({ streaming: true, lastPacketAt: this.lastPacketAt });
  }

  stop(): void {
    this.disposeDecoder();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.outGain = null;
    this.nextPlayTime = 0;
    this.frameCount = 0;
    this.lastPacketAt = 0;
    this.emit({ streaming: false, lastPacketAt: 0 });
  }

  private initContext(): void {
    if (typeof AudioContext === 'undefined') return;
    const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const Ctor = w.webkitAudioContext ?? AudioContext;
    this.ctx = new Ctor({ sampleRate: this.sampleRate });
    this.outGain = this.ctx.createGain();
    this.outGain.gain.value = 1.0;
    this.outGain.connect(this.ctx.destination);
  }

  private initDecoder(): void {
    this.disposeDecoder();
    console.log(`[audio] Initializing Opus decoder: ${this.sampleRate} Hz, ${this.channels} ch`);

    this.decoder = new AudioDecoder({
      output: (audioData: AudioData) => {
        try {
          this.scheduleAudio(audioData);
        } catch (e) {
          console.error('[audio] Playback scheduling failed:', e);
        } finally {
          audioData.close();
        }
      },
      error: (e: DOMException) => {
        console.error('[audio] Decode error, rebuilding decoder:', e);
        // Each Opus packet is independently decodable, so rebuilding after an
        // error lets us continue from the next frame.
        this.disposeDecoder();
        this.nextPlayTime = 0;
      },
    });

    this.decoder.configure({
      codec: 'opus',
      sampleRate: this.sampleRate,
      numberOfChannels: this.channels,
    });
  }

  private disposeDecoder(): void {
    if (this.decoder) {
      try { this.decoder.close(); } catch { /* already closed */ }
      this.decoder = null;
    }
  }

  private scheduleAudio(audioData: AudioData): void {
    if (!this.ctx || !this.outGain) return;

    const frames = audioData.numberOfFrames;
    const ch = audioData.numberOfChannels;
    if (frames === 0 || ch === 0) return;

    const buffer = this.ctx.createBuffer(ch, frames, audioData.sampleRate);

    // Copy each channel as planar float; copyTo converts the decoder's native
    // format into the requested destination format.
    for (let c = 0; c < ch; c++) {
      const plane = buffer.getChannelData(c);
      audioData.copyTo(plane, { format: 'f32-planar', planeIndex: c });
    }

    // If the context clock has moved past our scheduled position (we underran
    // — e.g. after a decode hiccup), resync to play live rather than in the past.
    const now = this.ctx.currentTime;
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now + SCHEDULE_AHEAD;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outGain);
    source.start(this.nextPlayTime);

    this.nextPlayTime += buffer.duration;
  }

  private emit(patch: Partial<AudioState>): void {
    this.state = { ...this.state, ...patch };
    if (this.onState) {
      try { this.onState(this.state); } catch { /* handler errors are non-fatal */ }
    }
  }
}