package com.saferoute.common;

/** Spaces calls to a public API at least {@code minIntervalMs} apart (provider usage policies). */
public class RequestGate {

    private final long minIntervalMs;
    private long nextSlot = 0;

    public RequestGate(long minIntervalMs) {
        this.minIntervalMs = minIntervalMs;
    }

    public void acquire() {
        long wait;
        synchronized (this) {
            long now = System.currentTimeMillis();
            wait = Math.max(0, nextSlot - now);
            nextSlot = Math.max(now, nextSlot) + minIntervalMs;
        }
        if (wait > 0) {
            try {
                Thread.sleep(wait);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new ApiException(ApiException.Code.UPSTREAM_UNAVAILABLE, "Request interrupted.", e);
            }
        }
    }
}
