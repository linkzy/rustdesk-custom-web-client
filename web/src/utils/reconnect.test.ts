import { describe, it, expect } from 'vitest';
import { reconnectDelayMs, RECONNECT_MAX_ATTEMPTS } from './reconnect';

describe('reconnectDelayMs', () => {
  it('backs off 1, 2, 4, 8, 15 seconds', () => {
    expect([1, 2, 3, 4, 5].map(reconnectDelayMs)).toEqual([1000, 2000, 4000, 8000, 15000]);
  });

  it('stays capped at 15 seconds for the remaining attempts', () => {
    for (let attempt = 5; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
      expect(reconnectDelayMs(attempt)).toBe(15000);
    }
  });

  it('gives up after the attempt budget', () => {
    expect(RECONNECT_MAX_ATTEMPTS).toBe(10);
    expect(reconnectDelayMs(RECONNECT_MAX_ATTEMPTS + 1)).toBeNull();
  });

  it('rejects attempts that are not positive integers', () => {
    for (const attempt of [0, -1, 1.5, Number.NaN]) {
      expect(reconnectDelayMs(attempt)).toBeNull();
    }
  });
});
