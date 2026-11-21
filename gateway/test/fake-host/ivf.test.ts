import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseIvf, ivfFrameRate, isVp9Keyframe } from './ivf';

const CLIP = path.resolve(__dirname, 'assets', 'screen.ivf');

function loadClip() {
  return parseIvf(new Uint8Array(fs.readFileSync(CLIP)));
}

describe('ivf keyframe detection', () => {
  it('reads frame_marker, profile and frame_type from a real VP9 header', () => {
    const clip = loadClip();

    // The clip was encoded with -g 30: one keyframe per GOP, the first is frame 0.
    expect(clip.frames[0].isKeyframe).toBe(true);
    for (let i = 1; i < Math.min(30, clip.frames.length); i++) {
      expect(clip.frames[i].isKeyframe).toBe(false);
    }
    expect(clip.frames[30].isKeyframe).toBe(true);
  });

  it('rejects buffers that do not start with the 0b10 frame marker', () => {
    // 0b00… frame_marker is wrong.
    expect(isVp9Keyframe(Uint8Array.from([0x00, 0x00, 0x00]))).toBe(false);
    // 0b01… also wrong.
    expect(isVp9Keyframe(Uint8Array.from([0x40, 0x00, 0x00]))).toBe(false);
    expect(isVp9Keyframe(new Uint8Array(0))).toBe(false);
  });

  it('reads an INTER_FRAME (frame_type 1) as not-key even with a valid marker', () => {
    // Bits, MSB first: marker 10 | profile_low 0 | profile_high 0 | show_existing 0 | frame_type.
    // 0b1000_0100 → INTER_FRAME (frame_type 1).
    expect(isVp9Keyframe(Uint8Array.from([0b10000100, 0x00]))).toBe(false);
    // 0b1000_0000 → KEY_FRAME (frame_type 0).
    expect(isVp9Keyframe(Uint8Array.from([0b10000000, 0x00]))).toBe(true);
    // show_existing_frame = 1 is not a decodable frame at all.
    expect(isVp9Keyframe(Uint8Array.from([0b10001000, 0x00]))).toBe(false);
  });
});

describe('ivf reader', () => {
  it('parses the container header of the shipped clip', () => {
    const clip = loadClip();
    expect(clip.fourcc).toBe('VP90');
    expect(clip.width).toBe(640);
    expect(clip.height).toBe(360);
    expect(ivfFrameRate(clip)).toBe(30);
  });

  it('yields every 10-second frame with a non-empty payload', () => {
    const clip = loadClip();
    expect(clip.frames).toHaveLength(300);
    for (const frame of clip.frames) {
      expect(frame.data.length).toBeGreaterThan(0);
    }
    // Timestamps are the frame index in the clip's timebase.
    expect(clip.frames[7].timestamp).toBe(7);
  });

  it('is deterministic: two parses of the same bytes agree byte for byte', () => {
    const a = loadClip();
    const b = loadClip();
    expect(a.frames.map((f) => f.isKeyframe)).toEqual(b.frames.map((f) => f.isKeyframe));
    expect(Buffer.from(a.frames[3].data).equals(Buffer.from(b.frames[3].data))).toBe(true);
  });

  it('throws on a non-IVF file instead of returning garbage', () => {
    expect(() => parseIvf(new Uint8Array(40))).toThrow(/DKIF/);
    expect(() => parseIvf(new Uint8Array(8))).toThrow(/32-byte header/);
  });
});
