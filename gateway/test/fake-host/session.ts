import fs from 'node:fs';
import WebSocket from 'ws';
import nacl from 'tweetnacl';
import type * as protobuf from 'protobufjs';
import { loadProtos } from '../../src/utils/proto';
import { hashPassword } from '../../src/utils/crypto';
import { CHALLENGE, deterministicKeypair, SCREEN } from './config';
import { ivfFrameRate, parseIvf, type IvfFile } from './ivf';

/**
 * One fake-host session: everything a real RustDesk host does after the relay
 * pairs it with the gateway, from the SignedId handshake to the frame stream.
 *
 * Ordering follows the real host (docs/PROTOCOL.md):
 *   SignedId → PublicKey → Hash → LoginRequest → LoginResponse
 *   → TestDelay every second + VideoFrame stream
 *
 * Messages after PublicKey are encrypted with the symmetric key the client
 * generates. Sequence numbers start at 1 and are incremented *before* use, the
 * same rule the gateway's SeqCounter encodes — a post-increment here would make
 * every nonce wrong and the gateway would fail to decrypt the first Hash.
 */

const ED25519_SIG_LEN = 64;

/** Classic 3-byte Opus comfort-noise packet (fullband, 20 ms). */
const OPUS_SILENCE = Uint8Array.from([0xf8, 0xff, 0xfe]);
const OPUS_FRAME_MS = 20;

export interface InputEvent {
  /** Monotonic index, so a test can say "the event after connect". */
  seq: number;
  at: number;
  type: 'mouse' | 'key';
  /** Raw values as they arrived, already decoded from protobuf. */
  detail: Record<string, unknown>;
}

export interface SessionOptions {
  id: string;
  password: string;
  acceptAnyPassword: boolean;
  audio: boolean;
  /** Absolute path of the VP9 clip to replay (ignored when videoBytes is set). */
  videoFile?: string;
  /** In-memory override for the clip (used by the integration test). */
  videoBytes?: Uint8Array;
  log: (msg: string) => void;
  /** Called with every decoded input event, for the control API. */
  onInput: (event: InputEvent) => void;
}

export interface SessionStats {
  state: 'handshaking' | 'authenticated' | 'streaming' | 'closed';
  passwordAccepted: boolean | null;
  framesSent: number;
  audioFramesSent: number;
  testDelayEchoes: number;
  lastDelayMs: number | null;
  peerInfoSent: boolean;
  codec: 'vp9' | null;
}

export class FakeHostSession {
  readonly stats: SessionStats = {
    state: 'handshaking',
    passwordAccepted: null,
    framesSent: 0,
    audioFramesSent: 0,
    testDelayEchoes: 0,
    lastDelayMs: null,
    peerInfoSent: false,
    codec: null,
  };

  private root: protobuf.Root | null = null;
  private ws: WebSocket;
  private readonly opts: SessionOptions;

  /** The host's long-term Curve25519 keypair (fixed, see config.ts). */
  private readonly hostKeys = deterministicKeypair(1);
  private sessionKey: Uint8Array | null = null;
  private sendSeq = 1n;
  private recvSeq = 1n;

  private video: IvfFile | null = null;
  private frameIndex = 0;
  private videoTimer: NodeJS.Timeout | null = null;
  private delayTimer: NodeJS.Timeout | null = null;
  private audioTimer: NodeJS.Timeout | null = null;
  private lastTestDelaySentAt = 0;
  private eventSeq = 0;

  constructor(ws: WebSocket, opts: SessionOptions) {
    this.ws = ws;
    this.opts = opts;
  }

  async start(): Promise<void> {
    this.root = await loadProtos();
    this.video = parseIvf(this.opts.videoBytes ?? readFile(requireVideoPath(this.opts.videoFile)));

    this.ws.on('message', (data: Buffer) => this.handleBytes(data));
    this.ws.on('close', () => this.stop('relay closed the connection'));

    // The peer speaks first, unencrypted, exactly like a real host.
    this.sendSignedId();
  }

  /**
   * SignedId.id = 64-byte Ed25519 signature + IdPk { id, pk }.
   *
   * The fake host has no Ed25519 key, so the signature is 64 fixed bytes: the
   * gateway skips them and only parses the IdPk that follows. Recorded in the
   * README as a deliberate simplification (no signature verification exists on
   * the client side either).
   */
  private sendSignedId(): void {
    const idPk = this.root!.lookupType('IdPk');
    const idPkBytes = idPk.encode(idPk.create({
      id: this.opts.id,
      pk: Buffer.from(this.hostKeys.publicKey),
    })).finish();

    const signature = new Uint8Array(ED25519_SIG_LEN);
    for (let i = 0; i < signature.length; i++) signature[i] = (i * 7 + 3) & 0xff;

    const id = new Uint8Array(ED25519_SIG_LEN + idPkBytes.length);
    id.set(signature, 0);
    id.set(idPkBytes, ED25519_SIG_LEN);

    this.sendPlain({ signed_id: { id: Buffer.from(id) } });
    this.opts.log('[host] → SignedId');
  }

  handleBytes(data: Buffer): void {
    try {
      let bytes: Uint8Array = new Uint8Array(data);

      if (this.sessionKey) {
        const nonce = makeNonce(this.recvSeq++);
        const opened = nacl.secretbox.open(bytes, nonce, this.sessionKey);
        if (!opened) {
          // Do not throw: a stale nonce would otherwise take the whole process
          // down instead of just this session.
          this.opts.log(`[host] failed to decrypt (seq=${this.recvSeq - 1n})`);
          return;
        }
        bytes = opened;
      }

      const Message = this.root!.lookupType('Message');
      const msg = Message.toObject(Message.decode(bytes), {
        longs: String,
        enums: Number,
        defaults: false,
        bytes: Buffer,
      }) as any;

      if (msg.public_key) this.handlePublicKey(msg.public_key);
      else if (msg.login_request) this.handleLoginRequest(msg.login_request);
      else if (msg.test_delay) this.handleTestDelayEcho(msg.test_delay);
      else if (msg.mouse_event) this.recordMouse(msg.mouse_event);
      else if (msg.key_event) this.recordKey(msg.key_event);
      else if (msg.misc) this.handleMisc(msg.misc);
    } catch (e) {
      this.opts.log(`[host] message error: ${(e as Error).message}`);
    }
  }

  private handlePublicKey(pk: { asymmetric_value?: Uint8Array; symmetric_value?: Uint8Array }): void {
    const envoyPk = toBytes(pk.asymmetric_value);
    const sealedKey = toBytes(pk.symmetric_value);

    if (envoyPk.length !== nacl.box.publicKeyLength || sealedKey.length === 0) {
      this.opts.log('[host] PublicKey malformed, closing');
      this.ws.close();
      return;
    }

    const opened = nacl.box.open(sealedKey, new Uint8Array(nacl.box.nonceLength), envoyPk, this.hostKeys.secretKey);
    if (!opened) {
      this.opts.log('[host] could not open the session key, closing');
      this.ws.close();
      return;
    }

    this.sessionKey = opened;
    this.sendSeq = 1n;
    this.recvSeq = 1n;
    this.opts.log('[host] session key accepted; encryption on');

    // First encrypted message: the auth challenge, like a real host.
    this.sendEncrypted({
      hash: {
        // Hash.salt/challenge are declared as strings in message.proto, so the
        // bytes travel as a latin-1 string. Keep them ASCII (they are).
        salt: CHALLENGE.salt.toString('binary'),
        challenge: CHALLENGE.challenge.toString('binary'),
      },
    });
    this.opts.log('[host] → Hash (salt + challenge)');
  }

  private handleLoginRequest(req: any): void {
    const expectedUser = this.opts.id;
    const gotPassword = toBytes(req.password);
    const expected = hashPassword(CHALLENGE.salt, CHALLENGE.challenge, this.opts.password);

    const passwordOk = Buffer.from(gotPassword).equals(Buffer.from(expected));

    if (String(req.username) !== expectedUser) {
      this.stats.passwordAccepted = false;
      this.sendEncrypted({ login_response: { error: `Wrong ID: ${req.username}` } });
      this.opts.log(`[host] login rejected: username "${req.username}" != "${expectedUser}"`);
      return;
    }

    if (!passwordOk && !this.opts.acceptAnyPassword) {
      this.stats.passwordAccepted = false;
      this.sendEncrypted({ login_response: { error: 'Wrong password' } });
      this.opts.log('[host] login rejected: password hash mismatch');
      return;
    }

    this.stats.passwordAccepted = passwordOk;
    this.stats.state = 'authenticated';
    this.opts.log(
      `[host] login accepted (password ${passwordOk ? 'matched' : 'ignored (acceptAnyPassword)'})`,
    );

    this.sendEncrypted({
      login_response: {
        peer_info: {
          username: 'fake',
          hostname: 'fake-host',
          platform: 'Linux',
          version: '1.3.8',
          displays: [{
            x: 0,
            y: 0,
            width: SCREEN.width,
            height: SCREEN.height,
            name: SCREEN.name,
            online: true,
            cursor_embedded: false,
          }],
          current_display: 0,
          features: { privacy_mode: false, terminal: false },
          encoding: { h264: false, h265: false, vp8: false, av1: false },
        },
      },
    });
    this.stats.peerInfoSent = true;
    this.opts.log(`[host] → LoginResponse with PeerInfo ${SCREEN.width}x${SCREEN.height}`);

    // A real host starts streaming after the client says video_received, but
    // it also sends the audio format up front. Both are safe to do right away.
    if (this.opts.audio) {
      this.sendEncrypted({ misc: { audio_format: { sample_rate: 48000, channels: 2 } } });
    }
    this.startStreaming();
  }

  private startStreaming(): void {
    if (this.videoTimer) return;
    const fps = ivfFrameRate(this.video!) || SCREEN.fps;
    const frameMs = Math.round(1000 / fps);
    this.stats.state = 'streaming';
    this.stats.codec = 'vp9';
    this.opts.log(`[host] streaming VP9 ${SCREEN.width}x${SCREEN.height} @ ${fps} fps`);

    this.videoTimer = setInterval(() => this.sendNextFrame(), frameMs);

    // A real host sends TestDelay about once a second. The gateway echoes it
    // back with from_client: false and derives its FPS target from the RTT.
    this.delayTimer = setInterval(() => this.sendTestDelay(), 1000);
    this.sendTestDelay();

    if (this.opts.audio) {
      this.audioTimer = setInterval(() => this.sendAudio(), OPUS_FRAME_MS);
    }
  }

  private sendNextFrame(): void {
    if (!this.video || !this.sessionKey) return;
    const frame = this.video.frames[this.frameIndex % this.video.frames.length];
    this.frameIndex += 1;

    this.sendEncrypted({
      video_frame: {
        vp9s: {
          frames: [{
            data: Buffer.from(frame.data),
            key: frame.isKeyframe,
          }],
        },
      },
    });
    this.stats.framesSent += 1;
  }

  private sendAudio(): void {
    if (!this.sessionKey) return;
    this.sendEncrypted({ audio_frame: { data: Buffer.from(OPUS_SILENCE) } });
    this.stats.audioFramesSent += 1;
  }

  private sendTestDelay(): void {
    if (!this.sessionKey) return;
    this.lastTestDelaySentAt = Date.now();
    this.sendEncrypted({
      test_delay: { time: BigInt(Date.now()), from_client: false, last_delay: 0 },
    });
  }

  private handleTestDelayEcho(msg: any): void {
    // The gateway echoes what we sent with from_client: false. Anything with
    // from_client: true is the client opening its own probe and must not be
    // counted as an echo (mirrors the gateway's own pitfall #2).
    if (msg.from_client) return;
    this.stats.testDelayEchoes += 1;
    if (this.lastTestDelaySentAt) {
      this.stats.lastDelayMs = Date.now() - this.lastTestDelaySentAt;
    }
  }

  private recordMouse(ev: any): void {
    const event: InputEvent = {
      seq: ++this.eventSeq,
      at: Date.now(),
      type: 'mouse',
      detail: {
        mask: Number(ev.mask) || 0,
        x: Number(ev.x),
        y: Number(ev.y),
        modifiers: (ev.modifiers ?? []).map((m: unknown) => Number(m)),
      },
    };
    this.opts.log(`[host] ← mouse x=${event.detail.x} y=${event.detail.y} mask=${event.detail.mask}`);
    this.opts.onInput(event);
  }

  private recordKey(ev: any): void {
    const union = ev.control_key !== undefined
      ? { control_key: Number(ev.control_key) }
      : ev.chr !== undefined
        ? { chr: Number(ev.chr) }
        : ev.unicode !== undefined
          ? { unicode: Number(ev.unicode) }
          : {};

    const event: InputEvent = {
      seq: ++this.eventSeq,
      at: Date.now(),
      type: 'key',
      detail: {
        down: Boolean(ev.down),
        mode: Number(ev.mode) || 0,
        modifiers: (ev.modifiers ?? []).map((m: unknown) => Number(m)),
        ...union,
      },
    };
    this.opts.log(`[host] ← key ${JSON.stringify(event.detail)}`);
    this.opts.onInput(event);
  }

  /**
   * Misc messages the gateway sends: `video_received` and `refresh_video` after
   * login, then periodic option updates. A real host would act on refresh_video
   * by forcing a keyframe; the fake clip already starts with one, and looping
   * it keeps every GOP aligned, so nothing needs forcing.
   */
  private handleMisc(misc: any): void {
    if (misc.video_received) this.opts.log('[host] ← misc.video_received');
    if (misc.refresh_video) this.opts.log('[host] ← misc.refresh_video');
    if (misc.option) this.opts.log(`[host] ← misc.option ${JSON.stringify(misc.option)}`);
  }

  private sendPlain(payload: Record<string, unknown>): void {
    const Message = this.root!.lookupType('Message');
    const bytes = Message.encode(Message.create(payload)).finish();
    this.ws.send(bytes, { binary: true });
  }

  private sendEncrypted(payload: Record<string, unknown>): void {
    if (!this.sessionKey) throw new Error('[host] cannot encrypt before the session key exists');
    const Message = this.root!.lookupType('Message');
    const plain = Message.encode(Message.create(payload)).finish();
    // Pre-increment: the first encrypted message uses sequence 1.
    const sealed = nacl.secretbox(plain, makeNonce(this.sendSeq++), this.sessionKey);
    this.ws.send(sealed, { binary: true });
  }

  stop(reason: string): void {
    if (this.stats.state === 'closed') return;
    this.stats.state = 'closed';
    for (const timer of [this.videoTimer, this.delayTimer, this.audioTimer]) {
      if (timer) clearInterval(timer);
    }
    this.videoTimer = null;
    this.delayTimer = null;
    this.audioTimer = null;
    this.opts.log(`[host] session ended: ${reason}`);
  }
}

/** 24-byte nonce: 64-bit little-endian seqnum + 16 zero bytes. */
function makeNonce(seq: bigint): Uint8Array {
  const nonce = new Uint8Array(24);
  new DataView(nonce.buffer).setBigUint64(0, seq, true);
  return nonce;
}

/** Protobuf `bytes` may arrive as Buffer, Uint8Array, base64 or latin-1 string. */
function toBytes(value: unknown): Uint8Array {
  if (!value) return new Uint8Array(0);
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new Uint8Array(Buffer.from(value, 'base64'));
  return new Uint8Array(Object.values(value as Record<string, number>));
}

function requireVideoPath(filePath: string | undefined): string {
  if (!filePath) {
    throw new Error('[host] no video source: pass videoBytes or videoFile');
  }
  return filePath;
}

function readFile(filePath: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(filePath));
}
