import { describe, it, expect } from 'vitest';
import {
  CODEC_H264,
  CODEC_VP9,
  CODEC_VP8,
  CODEC_AV1,
  CODEC_AUDIO,
  FRAME_HEADER_LENGTH,
  buildVideoPacket,
  buildAudioPacket,
} from './frames';

describe('binary frame header', () => {
  it('writes the video codec id in byte 0 and the keyframe flag in byte 1', () => {
    // Marker bytes are protocol constants: 1–4 video, 5 audio.
    expect([CODEC_H264, CODEC_VP9, CODEC_VP8, CODEC_AV1]).toEqual([1, 2, 3, 4]);
    expect(CODEC_AUDIO).toBe(5);

    const payload = Uint8Array.from([0xaa, 0xbb, 0xcc]);

    const key = buildVideoPacket(CODEC_H264, true, payload);
    expect(key[0]).toBe(CODEC_H264);
    expect(key[1]).toBe(1);
    expect(Array.from(key.subarray(FRAME_HEADER_LENGTH))).toEqual([0xaa, 0xbb, 0xcc]);

    const delta = buildVideoPacket(CODEC_VP9, false, payload);
    expect(delta[0]).toBe(CODEC_VP9);
    expect(delta[1]).toBe(0);
  });

  it('keeps the header at exactly 2 bytes, for video and for audio', () => {
    const video = buildVideoPacket(CODEC_AV1, false, Uint8Array.from([9]));
    expect(video).toHaveLength(FRAME_HEADER_LENGTH + 1);
    expect(video[FRAME_HEADER_LENGTH]).toBe(9);

    const audio = buildAudioPacket(Uint8Array.from([0x10, 0x20, 0x30]));
    expect(audio).toHaveLength(FRAME_HEADER_LENGTH + 3);
    expect(audio[0]).toBe(CODEC_AUDIO);
    expect(audio[1]).toBe(0);
    expect(Array.from(audio.subarray(FRAME_HEADER_LENGTH))).toEqual([0x10, 0x20, 0x30]);
  });

  it('copies only the visible part of a subarray payload and leaves the source untouched', () => {
    const payload = Uint8Array.from([1, 2, 3]);
    buildVideoPacket(CODEC_H264, true, payload);
    expect(Array.from(payload)).toEqual([1, 2, 3]);
    expect(buildVideoPacket(CODEC_H264, false, new Uint8Array(0))).toHaveLength(2);

    // subarray(1, 3) must not drag in the bytes around it.
    const backing = Uint8Array.from([0xff, 0x01, 0x02, 0xff]);
    const packet = buildAudioPacket(backing.subarray(1, 3));
    expect(Array.from(packet.subarray(FRAME_HEADER_LENGTH))).toEqual([0x01, 0x02]);
  });
});
