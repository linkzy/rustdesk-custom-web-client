import { describe, it, expect } from 'vitest';
import {
  CODEC_H264,
  CODEC_VP9,
  CODEC_VP8,
  CODEC_AV1,
  CODEC_AUDIO,
  FRAME_HEADER_LENGTH,
  CODEC_STRINGS,
  parseFrame,
  codecStringFor,
  isAudioFrame,
} from './frameProtocol';

/** Builds a frame the way the gateway does: [codec][flag][...payload]. */
function frame(codecId: number, flag: number, payload: number[]): Uint8Array {
  return Uint8Array.from([codecId, flag, ...payload]);
}

describe('parseFrame', () => {
  it('reads the codec id from byte 0 and strips the 2-byte header', () => {
    const parsed = parseFrame(frame(CODEC_H264, 1, [0x10, 0x20]));
    expect(parsed).not.toBeNull();
    expect(parsed!.codecId).toBe(CODEC_H264);
    expect(Array.from(parsed!.payload)).toEqual([0x10, 0x20]);
  });

  it('reads the keyframe flag from the low bit of byte 1 only', () => {
    expect(parseFrame(frame(CODEC_VP9, 1, [0]))!.isKeyframe).toBe(true);
    expect(parseFrame(frame(CODEC_VP9, 0, [0]))!.isKeyframe).toBe(false);
    // 0b10 has the low bit clear; 0b11 has it set.
    expect(parseFrame(frame(CODEC_VP9, 2, [0]))!.isKeyframe).toBe(false);
    expect(parseFrame(frame(CODEC_VP9, 3, [0]))!.isKeyframe).toBe(true);
  });

  it('rejects frames shorter than a header plus one payload byte', () => {
    expect(parseFrame(new Uint8Array(0))).toBeNull();
    expect(parseFrame(Uint8Array.from([CODEC_H264]))).toBeNull();
    expect(parseFrame(Uint8Array.from([CODEC_H264, 1]))).toBeNull();
    expect(parseFrame(frame(CODEC_H264, 1, [0]))).not.toBeNull();
  });

  it('treats the audio marker as a codec id that maps to no video codec string', () => {
    const parsed = parseFrame(frame(CODEC_AUDIO, 0, [0xfc]));
    expect(parsed!.codecId).toBe(CODEC_AUDIO);
    expect(codecStringFor(parsed!.codecId)).toBeNull();
    expect(Array.from(parsed!.payload)).toEqual([0xfc]);
  });

  it('returns a view over the same bytes instead of copying the payload', () => {
    const bytes = frame(CODEC_H264, 1, [7, 8, 9]);
    const parsed = parseFrame(bytes)!;
    bytes[FRAME_HEADER_LENGTH] = 42;
    expect(parsed.payload[0]).toBe(42);
  });
});

describe('codec strings', () => {
  it('maps the four video codec ids to WebCodecs codec strings', () => {
    expect(codecStringFor(CODEC_H264)).toBe('avc1.640028');
    expect(codecStringFor(CODEC_VP9)).toBe('vp09.00.10.08');
    expect(codecStringFor(CODEC_VP8)).toBe('vp8');
    expect(codecStringFor(CODEC_AV1)).toBe('av01.0.04M.08');
    expect(Object.keys(CODEC_STRINGS)).toHaveLength(4);
  });

  it('returns null for the audio marker and unknown ids', () => {
    expect(codecStringFor(0)).toBeNull();
    expect(codecStringFor(CODEC_AUDIO)).toBeNull();
    expect(codecStringFor(99)).toBeNull();
  });
});

describe('isAudioFrame', () => {
  it('is true only for marker 5 with a payload behind it', () => {
    expect(isAudioFrame(frame(CODEC_AUDIO, 0, [1]))).toBe(true);
    expect(isAudioFrame(frame(CODEC_H264, 1, [1]))).toBe(false);
    expect(isAudioFrame(Uint8Array.from([CODEC_AUDIO]))).toBe(false);
    expect(isAudioFrame(new Uint8Array(0))).toBe(false);
  });
});
