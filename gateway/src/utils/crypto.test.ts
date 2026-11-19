import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, makeNonce, SeqCounter } from './crypto';

/**
 * Independent reference implementation of the RustDesk hash, written straight
 * from the documented algorithm instead of calling the helper under test.
 */
function referenceHash(password: string, salt: Buffer, challenge: Buffer): Buffer {
  const intermediate = createHash('sha256')
    .update(Buffer.concat([Buffer.from(password, 'utf8'), salt]))
    .digest();
  return createHash('sha256')
    .update(Buffer.concat([intermediate, challenge]))
    .digest();
}

describe('hashPassword', () => {
  it('matches SHA256(SHA256(password+salt)+challenge) for fixed and random inputs', () => {
    const cases = [
      { password: 'hunter2', salt: Buffer.from('salty-salt'), challenge: Buffer.from('challenge-bytes') },
      ...Array.from({ length: 3 }, (_, i) => ({
        password: `pw-${i}`,
        salt: randomBytes(16),
        challenge: randomBytes(32),
      })),
    ];

    for (const { password, salt, challenge } of cases) {
      const actual = Buffer.from(hashPassword(salt, challenge, password));
      expect(actual).toHaveLength(32);
      expect(actual.equals(referenceHash(password, salt, challenge))).toBe(true);
    }
  });

  it('is not a flat SHA256(password+salt+challenge): the double hash and its order matter', () => {
    const salt = Buffer.from('abc');
    const challenge = Buffer.from('def');
    const flat = createHash('sha256')
      .update(Buffer.concat([Buffer.from('pw'), salt, challenge]))
      .digest();

    expect(Buffer.from(hashPassword(salt, challenge, 'pw')).equals(flat)).toBe(false);
  });

  it('changes when any of password, salt or challenge changes', () => {
    const salt = Buffer.from('salt');
    const challenge = Buffer.from('challenge');
    const base = Buffer.from(hashPassword(salt, challenge, 'pw'));

    expect(Buffer.from(hashPassword(salt, challenge, 'pw2')).equals(base)).toBe(false);
    expect(Buffer.from(hashPassword(Buffer.from('other'), challenge, 'pw')).equals(base)).toBe(false);
    expect(Buffer.from(hashPassword(salt, Buffer.from('other'), 'pw')).equals(base)).toBe(false);
  });

  it('hashes the UTF-8 bytes of a non-ASCII password', () => {
    const salt = Buffer.from('s');
    const challenge = Buffer.from('c');
    const password = 'pässwörd';
    expect(Buffer.from(hashPassword(salt, challenge, password))
      .equals(referenceHash(password, salt, challenge))).toBe(true);
  });
});

describe('makeNonce', () => {
  it('is 24 bytes: 64-bit little-endian seqnum followed by 16 zero bytes', () => {
    expect(Array.from(makeNonce(1n))).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);

    // Little-endian, not big-endian: least-significant byte comes first.
    const nonce = makeNonce(0x0102030405060708n);
    expect(nonce).toHaveLength(24);
    expect(Array.from(nonce.subarray(0, 8))).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);

    // A full 64-bit value stays inside the first 8 bytes; the tail stays zero.
    const max = makeNonce(0xffffffffffffffffn);
    expect(Array.from(max.subarray(0, 8))).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
    expect(max.subarray(8).every((b) => b === 0)).toBe(true);
  });
});

describe('SeqCounter (pre-increment)', () => {
  it('starts at zero and the first message uses sequence 1', () => {
    const counter = new SeqCounter();
    expect(counter.value).toBe(0n);
    expect(counter.next()).toBe(1n);
    expect(counter.value).toBe(1n);
  });

  it('increments monotonically without repeats, and reset() returns it to 1', () => {
    const counter = new SeqCounter();
    const seen = [counter.next(), counter.next(), counter.next()];
    expect(seen).toEqual([1n, 2n, 3n]);
    expect(new Set(seen.map(String)).size).toBe(3);

    counter.reset();
    expect(counter.value).toBe(0n);
    expect(counter.next()).toBe(1n);
  });
});
