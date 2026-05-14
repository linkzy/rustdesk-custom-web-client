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

export class VideoFrameDecoder {
  private decoder: VideoDecoder | null = null;
  private currentCodecId = 0;
  private onFrame: FrameCallback;
  private frameCount = 0;

  constructor(onFrame: FrameCallback) {
    this.onFrame = onFrame;
  }

  handleFrame(buffer: ArrayBuffer): void {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 3) return;

    const codecId = bytes[0];
    const isKeyframe = (bytes[1] & 1) === 1;
    const frameData = bytes.slice(2);

    if (codecId !== this.currentCodecId) {
      this.initDecoder(codecId);
    }

    if (!this.decoder) return;

    try {
      const chunk = new EncodedVideoChunk({
        type: isKeyframe ? 'key' : 'delta',
        timestamp: this.frameCount++ * (1_000_000 / 30),
        data: frameData,
      });
      this.decoder.decode(chunk);
    } catch (e) {
      console.error('[decoder] Failed to decode chunk:', e);
    }
  }

  private initDecoder(codecId: number): void {
    this.decoder?.close();
    this.decoder = null;
    this.currentCodecId = 0;
    this.frameCount = 0;

    const codecString = CODEC_STRINGS[codecId];
    if (!codecString) {
      console.error('[decoder] Unknown codec ID:', codecId);
      return;
    }

    console.log(`[decoder] Initializing for codec: ${codecString}`);

    this.decoder = new VideoDecoder({
      output: (frame) => {
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
    console.log('[decoder] Decoder ready');
  }

  close(): void {
    this.decoder?.close();
    this.decoder = null;
  }
}
