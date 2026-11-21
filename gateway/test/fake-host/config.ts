import nacl from 'tweetnacl';
import type { ServerConfig } from '../../src/session';


/**
 * The virtual screen the fake host pretends to capture: a fixed resolution and
 * a frame loop over a deterministic clip. The moving elements are burnt into
 * the shipped VP9 file, so the picture depends only on the frame index — no
 * clock, no randomness, no font rendering.
 */
export interface ScreenSpec {
  width: number;
  height: number;
  fps: number;
  /** Human-readable display name reported in PeerInfo. */
  name: string;
}

export const SCREEN: ScreenSpec = {
  width: 640,
  height: 360,
  fps: 30,
  name: 'Fake Host Display',
};

export interface FakeHostOptions {
  /** RustDesk ID the gateway must ask for. */
  id: string;
  /** Password the gateway must send; empty string means "no password". */
  password: string;
  /** Accept any password (demo/GIF mode). Still exercises the hash path. */
  acceptAnyPassword: boolean;
  /** Port for the fake hbbs (rendezvous) WebSocket. */
  hbbsPort: number;
  /** Port for the fake hbbr (relay) WebSocket. */
  hbbrPort: number;
  /** Port for the localhost control HTTP API (/fake/events, /fake/state). */
  controlPort: number;
  /** Send Opus audio frames (silence) alongside the video. */
  audio: boolean;
  /** Number of recent input events kept for /fake/events. */
  eventBufferSize: number;
}

export const DEFAULTS: FakeHostOptions = {
  id: '123456789',
  password: 'demo',
  acceptAnyPassword: false,
  hbbsPort: 21118,
  hbbrPort: 21119,
  controlPort: 8081,
  audio: false,
  eventBufferSize: 200,
};

/**
 * Fully deterministic key material. A real host generates these with the OS
 * RNG; the fake host uses fixed bytes so two runs produce the same handshake
 * and a test can assert on bytes instead of on "something happened".
 */
export function deterministicKeypair(seed: number): nacl.BoxKeyPair {
  const secretKey = new Uint8Array(32);
  for (let i = 0; i < secretKey.length; i++) {
    secretKey[i] = (seed * 37 + i * 11 + 5) & 0xff;
  }
  return nacl.box.keyPair.fromSecretKey(secretKey);
}

/** Fixed salt/challenge pair for the password challenge. */
export const CHALLENGE = {
  salt: Buffer.from('fake-host-salt-0123456789abcdef', 'utf8'),
  challenge: Buffer.from('fake-host-challenge-0123456789abcdef', 'utf8'),
};
