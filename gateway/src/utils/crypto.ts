import * as crypto from 'crypto';

/**
 * RustDesk password hash (see client.rs `handle_hash`).
 *
 *   intermediate = SHA256(password_utf8 + salt_bytes)
 *   final        = SHA256(intermediate + challenge_bytes)
 *
 * The salt and challenge arrive as protobuf `bytes` fields, so they must be
 * treated as raw binary — never base64-decoded.
 */
export function hashPassword(
  salt: Buffer | Uint8Array,
  challenge: Buffer | Uint8Array,
  password: string,
): Uint8Array {
  const intermediate = crypto
    .createHash('sha256')
    .update(Buffer.from(password, 'utf8'))
    .update(salt)
    .digest();

  const final = crypto
    .createHash('sha256')
    .update(intermediate)
    .update(challenge)
    .digest();

  return new Uint8Array(final);
}

/**
 * Builds the 24-byte NaCl secretbox nonce for a sequence number: the seqnum as
 * 64-bit little-endian in the first 8 bytes, followed by 16 zero bytes.
 */
export function makeNonce(seqnum: bigint): Uint8Array {
  const nonce = new Uint8Array(24);
  const view = new DataView(nonce.buffer);
  view.setBigUint64(0, seqnum, true); // little-endian
  return nonce;
}

/**
 * Monotonic sequence counter used for NaCl secretbox nonces.
 *
 * RustDesk counters start at zero and the *first* message uses sequence 1, so
 * `next()` pre-increments before returning. Post-incrementing would shift every
 * nonce by one and the peer would fail to decrypt.
 */
export class SeqCounter {
  private seq = 0n;

  /** Returns the next sequence number: 1 on the first call after construction. */
  next(): bigint {
    this.seq += 1n;
    return this.seq;
  }

  /** Resets to zero; the next call to `next()` returns 1 again. */
  reset(): void {
    this.seq = 0n;
  }

  get value(): bigint {
    return this.seq;
  }
}
