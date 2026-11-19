// Pure parsing of the binary frames the gateway sends to the browser:
//
//   video: [codecId][keyframeFlag][...encoded frame bytes]
//   audio: [5][0][...Opus packet bytes]
//
// Kept free of WebCodecs so it can be unit-tested in plain Node/jsdom.

export const CODEC_H264 = 1;
export const CODEC_VP9 = 2;
export const CODEC_VP8 = 3;
export const CODEC_AV1 = 4;
export const CODEC_AUDIO = 5; // Opus audio

/** Header length preceding the payload in every binary frame. */
export const FRAME_HEADER_LENGTH = 2;

/** WebCodecs codec string for each video codec id. */
export const CODEC_STRINGS: Record<number, string> = {
  [CODEC_H264]: 'avc1.640028',
  [CODEC_VP9]: 'vp09.00.10.08',
  [CODEC_VP8]: 'vp8',
  [CODEC_AV1]: 'av01.0.04M.08',
};

export interface ParsedFrame {
  /** Codec marker byte: 1–4 for video, 5 for Opus audio. */
  codecId: number;
  /** True when the video keyframe flag bit is set. Always false for audio. */
  isKeyframe: boolean;
  /** The payload without the 2-byte header (a view over the same buffer). */
  payload: Uint8Array;
}

/**
 * Splits a binary frame into its header fields and payload.
 * Returns null for frames too short to carry a header plus at least one byte.
 */
export function parseFrame(bytes: Uint8Array): ParsedFrame | null {
  if (bytes.length < FRAME_HEADER_LENGTH + 1) return null;
  return {
    codecId: bytes[0],
    isKeyframe: (bytes[1] & 1) === 1,
    payload: bytes.subarray(FRAME_HEADER_LENGTH),
  };
}

/** Codec string for a video codec id, or null when it is not a video codec. */
export function codecStringFor(codecId: number): string | null {
  return CODEC_STRINGS[codecId] ?? null;
}

/** True when the marker byte identifies an Opus audio frame. */
export function isAudioFrame(bytes: Uint8Array): boolean {
  return bytes.length >= FRAME_HEADER_LENGTH + 1 && bytes[0] === CODEC_AUDIO;
}
