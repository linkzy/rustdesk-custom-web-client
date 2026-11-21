// Minimal IVF container reader plus a VP9 keyframe detector.
//
// IVF is a trivial container: a 32-byte header followed by frames, each with a
// 12-byte header (u32 size, u64 timestamp, both little-endian) and the raw
// codec payload. It is only a test fixture format: the fake host ships one
// deterministic clip and replays its frames as VideoFrame messages.
//
// The keyframe flag is what the gateway turns into the browser frame header and
// what makes a WebCodecs VideoDecoder able to start (and restart) decoding, so
// it has to be right — hence reading it from the bitstream rather than guessing.

export interface IvfFrame {
  /** Raw VP9 payload. */
  data: Uint8Array;
  /** Timestamp from the IVF frame header. */
  timestamp: number;
  /** True when the VP9 uncompressed header marks this as a KEY_FRAME. */
  isKeyframe: boolean;
}

export interface IvfFile {
  /** FourCC from the container header, e.g. "VP90". */
  fourcc: string;
  width: number;
  height: number;
  /** Timebase denominator (ticks per second). */
  timebaseDen: number;
  /** Timebase numerator (ticks per frame). */
  timebaseNum: number;
  frames: IvfFrame[];
}

/** Reads `count` bits, MSB first, from a byte buffer. */
class BitReader {
  private byteOffset = 0;
  private bitOffset = 0;

  constructor(private readonly data: Uint8Array) {}

  readBit(): number {
    if (this.byteOffset >= this.data.length) throw new Error('bitstream exhausted');
    const bit = (this.data[this.byteOffset] >> (7 - this.bitOffset)) & 1;
    this.bitOffset += 1;
    if (this.bitOffset === 8) {
      this.bitOffset = 0;
      this.byteOffset += 1;
    }
    return bit;
  }

  readBits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) value = (value << 1) | this.readBit();
    return value;
  }

  skipBits(count: number): void {
    for (let i = 0; i < count; i++) this.readBit();
  }
}

/**
 * Detects a VP9 keyframe from the uncompressed header (VP9 spec, section 6.2):
 *
 *   frame_marker            2 bits, must be 0b10
 *   profile_low_bit         1 bit
 *   profile_high_bit        1 bit   → profile 0..3
 *   reserved_zero           1 bit   only when profile == 3
 *   show_existing_frame     1 bit
 *   frame_type              1 bit   0 = KEY_FRAME, 1 = INTER_FRAME
 *
 * Returns false for anything that does not look like a VP9 frame start.
 */
export function isVp9Keyframe(data: Uint8Array): boolean {
  try {
    const bits = new BitReader(data);
    if (bits.readBits(2) !== 0b10) return false; // frame_marker
    const profileLow = bits.readBit();
    const profileHigh = bits.readBit();
    const profile = (profileHigh << 1) | profileLow;
    if (profile === 3) bits.readBit(); // reserved_zero
    const showExistingFrame = bits.readBit();
    if (showExistingFrame === 1) return false; // re-displays an earlier frame
    return bits.readBits(1) === 0; // frame_type: 0 = KEY_FRAME
  } catch {
    return false; // too short to carry a header
  }
}

/** Parses a complete IVF file. Throws when the container header is invalid. */
export function parseIvf(buffer: Uint8Array): IvfFile {
  if (buffer.length < 32) throw new Error('IVF file shorter than its 32-byte header');
  const fourcc = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
  if (String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]) !== 'DKIF') {
    throw new Error('Not an IVF file (missing DKIF signature)');
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);
  const file: IvfFile = {
    fourcc,
    width: view.getUint16(12, true),
    height: view.getUint16(14, true),
    timebaseDen: view.getUint32(16, true),
    timebaseNum: view.getUint32(20, true),
    frames: [],
  };

  let offset = view.getUint16(6, true); // header size from the container
  if (offset < 32) offset = 32;

  while (offset + 12 <= buffer.length) {
    const size = view.getUint32(offset, true);
    const timestamp = Number(view.getBigUint64(offset + 4, true));
    const start = offset + 12;
    const end = start + size;
    if (size === 0 || end > buffer.length) break;
    const data = buffer.subarray(start, end);
    file.frames.push({ data, timestamp, isKeyframe: isVp9Keyframe(data) });
    offset = end;
  }

  if (file.frames.length === 0) throw new Error('IVF file contains no frames');
  return file;
}

/** Frames per second encoded in the IVF timebase (0 when it is unusable). */
export function ivfFrameRate(file: IvfFile): number {
  if (!file.timebaseNum || !file.timebaseDen) return 0;
  return file.timebaseDen / file.timebaseNum;
}
