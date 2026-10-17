import { AppError } from "./errors";

/**
 * Client-side politeness for public APIs: spaces requests at least
 * `minIntervalMs` apart and refuses requests during a cooldown after the
 * provider answered 429 Too Many Requests.
 */
export function createRequestGate(minIntervalMs: number) {
  let nextSlot = 0;
  let blockedUntil = 0;

  function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new AppError("ABORTED", "Request cancelled."));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  return {
    async acquire(signal?: AbortSignal): Promise<void> {
      const now = Date.now();
      if (blockedUntil > now) {
        throw new AppError("RATE_LIMITED", "Rate limited.", { retryAfterMs: blockedUntil - now });
      }
      const wait = Math.max(0, nextSlot - now);
      nextSlot = Math.max(now, nextSlot) + minIntervalMs;
      if (wait > 0) await sleep(wait, signal);
    },
    /** Start a cooldown, e.g. after a 429 response. */
    block(ms: number) {
      blockedUntil = Math.max(blockedUntil, Date.now() + ms);
    },
  };
}

/** Small bounded cache (insertion-order eviction). */
export function createCache<V>(maxEntries: number) {
  const map = new Map<string, V>();
  return {
    get(key: string): V | undefined {
      const value = map.get(key);
      if (value !== undefined) {
        map.delete(key);
        map.set(key, value);
      }
      return value;
    },
    set(key: string, value: V) {
      map.delete(key);
      map.set(key, value);
      if (map.size > maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
    },
  };
}
