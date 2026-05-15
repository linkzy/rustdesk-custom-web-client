const CODEC_H264 = 1;
const CODEC_VP9  = 2;
const CODEC_VP8  = 3;
const CODEC_AV1  = 4;

const CODEC_STRINGS: Record<number, string> = {
  [CODEC_H264]: 'avc1.640028',
  [CODEC_VP9]:  'vp09.00.10.08',
  [CODEC_VP8]:  'vp8',
  [CODEC_AV1]:  'av01.0.04M.08',
};

export type FrameCallback = (frame: VideoFrame) => void;

export interface DecoderStats {
  fps: number;
  frameIntervalMs: number;
  decodeTimeMs: number;
  lastFrameAt: number; // performance.now() timestamp of last decoded frame
}

export type StatsCallback = (stats: DecoderStats) => void;

export class VideoFrameDecoder {
  private decoder: VideoDecoder | null = null;
  private currentCodecId = 0;
  private onFrame: FrameCallback;
  private onStats?: StatsCallback;
  private frameCount = 0;

  // Stats tracking
  private lastFrameReceivedAt = 0;
  private decodeStartTimes = new Map<number, number>(); // chunkTs → perf.now start
  private recentIntervals: number[] = [];
  private recentDecodeTimes: number[] = [];
  private fpsFrameCount = 0;
  private fpsWindowStart = 0;
  private lastFrameAt = 0;

  constructor(onFrame: FrameCallback, onStats?: StatsCallback) {
    this.onFrame = onFrame;
    this.onStats = onStats;
  }

  handleFrame(buffer: ArrayBuffer): void {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 3) return;

    const codecId = bytes[0];
    const isKeyframe = (bytes[1] & 1) === 1;
    const frameData = bytes.slice(2);

    const now = performance.now();

    // Track inter-frame arrival interval
    if (this.lastFrameReceivedAt > 0) {
      const interval = now - this.lastFrameReceivedAt;
      this.recentIntervals.push(interval);
      if (this.recentIntervals.length > 60) this.recentIntervals.shift();
    }
    this.lastFrameReceivedAt = now;

    if (codecId !== this.currentCodecId) {
      this.initDecoder(codecId);
    }

    if (!this.decoder) return;

    const chunkTs = this.frameCount++ * (1_000_000 / 30);
    this.decodeStartTimes.set(chunkTs, now);

    try {
      const chunk = new EncodedVideoChunk({
        type: isKeyframe ? 'key' : 'delta',
        timestamp: chunkTs,
        data: frameData,
      });
      this.decoder.decode(chunk);
    } catch (e) {
      console.error('[decoder] Failed to decode chunk:', e);
      this.decodeStartTimes.delete(chunkTs);
    }
  }

  private initDecoder(codecId: number): void {
    this.decoder?.close();
    this.decoder = null;
    this.currentCodecId = 0;
    this.frameCount = 0;
    this.decodeStartTimes.clear();

    const codecString = CODEC_STRINGS[codecId];
    if (!codecString) {
      console.error('[decoder] Unknown codec ID:', codecId);
      return;
    }

    console.log(`[decoder] Initializing for codec: ${codecString}`);

    this.decoder = new VideoDecoder({
      output: (frame) => {
        const now = performance.now();

        // Decode time
        const startTime = this.decodeStartTimes.get(frame.timestamp);
        if (startTime !== undefined) {
          this.recentDecodeTimes.push(now - startTime);
          if (this.recentDecodeTimes.length > 60) this.recentDecodeTimes.shift();
          this.decodeStartTimes.delete(frame.timestamp);
        }

        this.lastFrameAt = now;
        this.fpsFrameCount++;

        // Emit stats once per second
        const elapsed = (now - this.fpsWindowStart) / 1000;
        if (elapsed >= 1.0 && this.fpsWindowStart > 0) {
          const fps = Math.round((this.fpsFrameCount / elapsed) * 10) / 10;
          const avgInterval = this.recentIntervals.length > 0
            ? this.recentIntervals.reduce((a, b) => a + b, 0) / this.recentIntervals.length : 0;
          const avgDecode = this.recentDecodeTimes.length > 0
            ? this.recentDecodeTimes.reduce((a, b) => a + b, 0) / this.recentDecodeTimes.length : 0;
          this.onStats?.({
            fps,
            frameIntervalMs: Math.round(avgInterval),
            decodeTimeMs: Math.round(avgDecode * 10) / 10,
            lastFrameAt: this.lastFrameAt,
          });
          this.fpsFrameCount = 0;
          this.fpsWindowStart = now;
        }

        this.onFrame(frame);
        frame.close();
      },
      error: (e) => {
        console.error('[decoder] Decode error:', e);
      },
    });

    this.decoder.configure({
      codec: codecString,
      optimizeForLatency: true,
    });

    this.currentCodecId = codecId;
    this.fpsWindowStart = performance.now();
    this.fpsFrameCount = 0;
    console.log('[decoder] Decoder ready');
  }

  close(): void {
    this.decoder?.close();
    this.decoder = null;
    this.decodeStartTimes.clear();
  }
}
