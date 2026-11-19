// Binary frame header sent to the browser over the gateway WebSocket.
//
//   video: [codecId][keyframeFlag][...encoded frame bytes]
//   audio: [5][0][...Opus packet bytes]
//
// The marker byte tells the web client where to route the packet: 1–4 are
// video codecs, 5 is Opus audio.

export const CODEC_H264 = 1;
export const CODEC_VP9 = 2;
export const CODEC_VP8 = 3;
export const CODEC_AV1 = 4;
export const CODEC_AUDIO = 5; // Opus audio

/** Length of the header that precedes the payload in every binary frame. */
export const FRAME_HEADER_LENGTH = 2;

/** Packs one encoded video frame with its codec id and keyframe flag. */
export function buildVideoPacket(codecId: number, isKeyframe: boolean, frameData: Uint8Array): Buffer {
  const packet = Buffer.alloc(FRAME_HEADER_LENGTH + frameData.length);
  packet[0] = codecId;
  packet[1] = isKeyframe ? 1 : 0;
  Buffer.from(frameData.buffer, frameData.byteOffset, frameData.length).copy(
    packet,
    FRAME_HEADER_LENGTH,
  );
  return packet;
}

/** Packs one raw Opus packet behind the audio marker byte. */
export function buildAudioPacket(opusData: Uint8Array): Buffer {
  const packet = Buffer.alloc(FRAME_HEADER_LENGTH + opusData.length);
  packet[0] = CODEC_AUDIO;
  packet[1] = 0;
  Buffer.from(opusData.buffer, opusData.byteOffset, opusData.length).copy(
    packet,
    FRAME_HEADER_LENGTH,
  );
  return packet;
}
