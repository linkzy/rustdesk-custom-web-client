import * as crypto from 'crypto';
import nacl from 'tweetnacl';
import WebSocket from 'ws';
import { loadProtos, encodeMessage, decodeMessage } from './utils/proto';
import { performRendezvous } from './rendezvous';
import { connectRelay, RelayConnection } from './relay';
import type * as protobuf from 'protobufjs';

// Codec IDs for the binary frame header sent to the browser
const CODEC_H264 = 1;
const CODEC_VP9  = 2;
const CODEC_VP8  = 3;
const CODEC_AV1  = 4;

export interface SessionOptions {
  targetId: string;
  password: string;
  browserWs: WebSocket;  // the browser's WebSocket connection
}

export class Session {
  private relay: RelayConnection | null = null;
  private root: protobuf.Root | null = null;
  private symmetricKey: Uint8Array | null = null;
  private ourKeypair: nacl.BoxKeyPair = nacl.box.keyPair();
  private sendSeq = 0n;
  private recvSeq = 0n;
  private options: SessionOptions;
  private remoteWidth = 0;
  private remoteHeight = 0;
  private targetId = '';  // stripped (no spaces) target RustDesk ID

  constructor(options: SessionOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    this.root = await loadProtos();

    // Strip spaces from ID (RustDesk UI shows "543 725 65" but protocol uses "54372565")
    this.targetId = this.options.targetId.replace(/\s+/g, '');
    const targetId = this.targetId;

    console.log(`[session] Starting rendezvous for peer: ${targetId}`);
    const { relayServer, uuid } = await performRendezvous(targetId);
    console.log(`[session] Rendezvous done. Relay: ${relayServer}, uuid: ${uuid}`);

    this.relay = await connectRelay(targetId, relayServer, uuid);
    console.log('[session] Relay connected. Waiting for handshake...');

    this.relay.onMessage((data: Buffer) => {
      console.log(`[relay] Received ${data.length} bytes from peer`);
      this.handleRelayMessage(data);
    });
  }

  private handleRelayMessage(data: Buffer): void {
    try {
      let bytes: Uint8Array<ArrayBufferLike> = new Uint8Array(data);

      // If we have a symmetric key, decrypt first
      if (this.symmetricKey) {
        const nonce = this.makeNonce(++this.recvSeq);
        const decrypted = nacl.secretbox.open(bytes, nonce, this.symmetricKey);
        if (!decrypted) {
          console.error('[session] Failed to decrypt message (seq=' + this.recvSeq + ')');
          return;
        }
        bytes = decrypted;
      }

      const msg = decodeMessage(this.root!, bytes) as any;
      const msgFields = Object.keys(msg).filter(k => msg[k] !== null && msg[k] !== undefined && msg[k] !== false && msg[k] !== 0 && msg[k] !== '');
      console.log('[session] Decoded message fields:', msgFields, '| raw hex:', Buffer.from(bytes).toString('hex').slice(0, 80));

      if (msg.signed_id) {
        this.handleSignedId(msg.signed_id);
      } else if (msg.hash) {
        this.handleHash(msg.hash);
      } else if (msg.login_response) {
        this.handleLoginResponse(msg.login_response);
      } else if (msg.public_key) {
        this.handlePublicKey(msg.public_key);
      } else if (msg.video_frame) {
        this.handleVideoFrame(msg.video_frame);
      } else if (msg.peer_info) {
        this.handlePeerInfo(msg.peer_info);
      } else if (msg.test_delay) {
        // Echo keepalive back to peer — silence for ~10s causes peer to close with 1006
        // time is decoded as string by protobufjs (longs: String), must convert to number to re-encode
        const echoTime = Number(msg.test_delay.time) || 0;
        this.sendMessage({ test_delay: { time: echoTime, from_client: true } });
        console.log('[session] Echoed TestDelay time=' + echoTime);
      } else {
        // Other messages (cursor, clipboard, etc.) — ignore for now
      }
    } catch (e) {
      console.error('[session] Error handling relay message:', e);
    }
  }

  private handleHash(hash: { salt: any; challenge: any }): void {
    console.log('[session] Received Hash challenge');

    // salt and challenge are bytes fields — protobufjs returns them as binary strings
    // (each char code = byte value). Use 'binary' encoding, NOT 'base64'.
    const toBuffer = (v: any): Buffer => {
      if (Buffer.isBuffer(v)) return v;
      if (v instanceof Uint8Array) return Buffer.from(v);
      if (typeof v === 'string') return Buffer.from(v, 'binary');
      return Buffer.alloc(0);
    };

    const salt      = toBuffer(hash.salt);
    const challenge = toBuffer(hash.challenge);
    console.log(`[session] Hash: salt=${salt.toString('hex')} challenge=${challenge.toString('hex')}`);

    const passwordBytes = this.hashPassword(salt, challenge, this.options.password);

    // RustDesk server checks: username must equal the target machine's own ID,
    // or be an IP/domain — empty string triggers LOGIN_MSG_OFFLINE.
    const loginRequest = {
      login_request: {
        username: this.targetId,
        password: passwordBytes,  // Uint8Array — raw SHA256 bytes
        my_id: 'rclient-web',
        my_name: 'Web Browser',
        option: {
          supported_decoding: {
            ability_vp8:  1,
            ability_vp9:  1,
            ability_h264: 1,
            ability_av1:  1,
            prefer: 2,  // H264
          },
        },
        video_ack_required: true,
        session_id: Math.floor(Math.random() * 0xFFFFFFFF),
        version: '1.2.4',
      },
    };

    this.sendMessage(loginRequest);
    console.log('[session] Sent LoginRequest');
  }

  private handleLoginResponse(resp: { error?: string; peer_info?: any }): void {
    if (resp.error) {
      console.error('[session] Login failed:', resp.error);
      this.sendBrowserJson({ type: 'error', message: resp.error });
      this.relay?.close();
      return;
    }
    if (resp.peer_info) {
      this.handlePeerInfo(resp.peer_info);
    }
    console.log('[session] Login successful');
  }

  private handlePeerInfo(peerInfo: any): void {
    const displays = peerInfo.displays ?? [];
    if (displays.length > 0) {
      this.remoteWidth = displays[0].width ?? 1920;
      this.remoteHeight = displays[0].height ?? 1080;
    }
    console.log(`[session] PeerInfo: ${this.remoteWidth}x${this.remoteHeight}`);
    this.sendBrowserJson({
      type: 'connected',
      width: this.remoteWidth,
      height: this.remoteHeight,
      codec: 'h264',
    });
  }

  private handleSignedId(signedId: { id?: any }): void {
    console.log('[session] Received SignedId — performing secure handshake');
    try {
      // protobufjs bytes → Uint8Array helper
      const toBytes = (v: any): Uint8Array => {
        if (!v) return new Uint8Array(0);
        if (v instanceof Uint8Array) return v;
        if (Buffer.isBuffer(v)) return new Uint8Array(v);
        if (typeof v === 'string') return new Uint8Array(Buffer.from(v, 'binary'));
        return new Uint8Array(Buffer.from(Object.values(v) as number[]));
      };

      const idBytes = toBytes(signedId.id);
      console.log(`[session] SignedId.id length: ${idBytes.length} bytes`);

      // signed_id.id = Ed25519 signature (64 bytes) + IdPk protobuf { id, pk }
      // Skip the 64-byte signature and parse IdPk to get the peer's Curve25519 public key.
      const ED25519_SIG_LEN = 64;
      if (idBytes.length <= ED25519_SIG_LEN) {
        throw new Error(`SignedId too short: ${idBytes.length} bytes`);
      }
      const idPkBytes = idBytes.slice(ED25519_SIG_LEN);
      const IdPk = this.root!.lookupType('IdPk');
      const idPk = IdPk.decode(idPkBytes) as any;
      const peerPk = toBytes(idPk.pk);
      console.log(`[session] Peer Curve25519 pk: ${peerPk.length} bytes (id=${idPk.id})`);

      if (peerPk.length !== 32) {
        throw new Error(`Expected 32-byte peer pk, got ${peerPk.length}`);
      }

      // Generate random 32-byte symmetric key + ephemeral Curve25519 keypair
      const symKey = nacl.randomBytes(nacl.secretbox.keyLength);  // 32 bytes
      const ephemeral = nacl.box.keyPair();
      const zeroNonce = new Uint8Array(nacl.box.nonceLength);     // 24-byte zero nonce

      // Encrypt symmetric key: box(symKey, zeroNonce, peerPk, ephemeralSk)
      const sealedKey = nacl.box(symKey, zeroNonce, peerPk, ephemeral.secretKey);

      // Send PublicKey { asymmetric_value: ephemeral.pk, symmetric_value: sealedKey }
      this.sendMessage({
        public_key: {
          asymmetric_value: ephemeral.publicKey,  // our ephemeral Curve25519 public key
          symmetric_value: sealedKey,              // sym key encrypted for peer
        },
      });

      // Store sym key — all subsequent messages from peer will be encrypted with it
      this.symmetricKey = symKey;
      this.recvSeq = 0n;
      this.sendSeq = 0n;
      console.log('[session] Sent PublicKey with symmetric key. Session encryption active.');
    } catch (e) {
      console.error('[session] handleSignedId failed:', e);
      this.sendBrowserJson({ type: 'error', message: 'Secure handshake failed' });
      this.relay?.close();
    }
  }

  private handlePublicKey(_pk: { asymmetric_value: any; symmetric_value: any }): void {
    // In the secure flow, the CLIENT generates the symmetric key in handleSignedId.
    // The server does NOT send a public_key response — the next message is an encrypted Hash.
    // This handler is kept as a no-op in case an unexpected public_key arrives.
    console.warn('[session] Unexpected PublicKey message received (ignored)');
  }

  private handleVideoFrame(frame: any): void {
    let codecId: number;
    let frames: any[];

    if (frame.h264s?.frames?.length) {
      codecId = CODEC_H264;
      frames = frame.h264s.frames;
    } else if (frame.vp9s?.frames?.length) {
      codecId = CODEC_VP9;
      frames = frame.vp9s.frames;
    } else if (frame.vp8s?.frames?.length) {
      codecId = CODEC_VP8;
      frames = frame.vp8s.frames;
    } else if (frame.av1s?.frames?.length) {
      codecId = CODEC_AV1;
      frames = frame.av1s.frames;
    } else {
      return; // unknown or empty frame
    }

    for (const f of frames) {
      const frameData = Buffer.from(f.data, 'base64');
      const isKey = f.key ? 1 : 0;

      // Build binary packet: [codecId][flags][...frameData]
      const packet = Buffer.alloc(2 + frameData.length);
      packet[0] = codecId;
      packet[1] = isKey;
      frameData.copy(packet, 2);

      if (this.options.browserWs.readyState === WebSocket.OPEN) {
        this.options.browserWs.send(packet);
      }
    }
  }

  // Send a protobuf Message to the remote peer (encrypted if key is available)
  sendMessage(payload: Record<string, unknown>): void {
    if (!this.root || !this.relay) return;
    let bytes = encodeMessage(this.root, payload);

    if (this.symmetricKey) {
      const nonce = this.makeNonce(++this.sendSeq);
      bytes = nacl.secretbox(bytes, nonce, this.symmetricKey);
    }

    this.relay.send(bytes);
  }

  disconnect(): void {
    this.relay?.close();
    this.relay = null;
    console.log('[session] Disconnected');
  }

  private hashPassword(salt: Buffer, challenge: Buffer, password: string): Uint8Array {
    // RustDesk algorithm (from client.rs handle_hash):
    // Step 1: intermediate = SHA256(password_string + salt_bytes)
    const intermediate = crypto.createHash('sha256')
      .update(Buffer.from(password, 'utf8'))
      .update(salt)
      .digest();

    // Step 2: final = SHA256(intermediate + challenge_bytes)
    const final = crypto.createHash('sha256')
      .update(intermediate)
      .update(challenge)
      .digest();

    return new Uint8Array(final);
  }

  private makeNonce(seqnum: bigint): Uint8Array {
    const nonce = new Uint8Array(24);
    const view = new DataView(nonce.buffer);
    view.setBigUint64(0, seqnum, true); // little-endian
    return nonce;
  }

  private sendBrowserJson(obj: Record<string, unknown>): void {
    if (this.options.browserWs.readyState === WebSocket.OPEN) {
      this.options.browserWs.send(JSON.stringify(obj));
    }
  }
}
