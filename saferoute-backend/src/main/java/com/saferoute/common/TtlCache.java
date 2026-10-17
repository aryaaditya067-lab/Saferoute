package com.saferoute.common;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/** Small bounded cache with expiry, for repeated provider lookups. */
public class TtlCache<V> {

    private record Entry<V>(V value, long expiresAt) {}

    private final int maxEntries;
    private final long ttlMs;
    private final LinkedHashMap<String, Entry<V>> map;

    public TtlCache(int maxEntries, Duration ttl) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttl.toMillis();
        this.map = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Entry<V>> eldest) {
                return size() > TtlCache.this.maxEntries;
            }
        };
    }

    public synchronized V get(String key) {
        Entry<V> entry = map.get(key);
        if (entry == null) return null;
        if (entry.expiresAt() < System.currentTimeMillis()) {
            map.remove(key);
            return null;
        }
        return entry.value();
    }

    public synchronized void put(String key, V value) {
        map.put(key, new Entry<>(value, System.currentTimeMillis() + ttlMs));
    }
}
