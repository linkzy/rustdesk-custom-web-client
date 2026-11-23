// Backoff schedule for automatic reconnection after an unexpected socket close.
// Pure so it can be unit-tested without a gateway: 1, 2, 4, 8, 15 s, then 15 s
// until the attempt budget runs out.

export const RECONNECT_DELAYS_S = [1, 2, 4, 8, 15] as const;
export const RECONNECT_MAX_ATTEMPTS = 10;

/**
 * Delay in milliseconds before reconnect attempt `attempt` (1-based), or `null`
 * once the attempt budget is exhausted.
 */
export function reconnectDelayMs(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > RECONNECT_MAX_ATTEMPTS) {
    return null;
  }
  const index = Math.min(attempt - 1, RECONNECT_DELAYS_S.length - 1);
  return RECONNECT_DELAYS_S[index] * 1000;
}
