package com.restaurant.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory token-bucket rate limiting (Bucket4j). One bucket per (pathGroup, clientKey).
 */
@Component
public class InMemoryBucketRateLimiter {

    private static final long EVICTION_IDLE_MS = 300_000;

    @Value("${rate_limit.auth_per_min:10}")
    private int authPerMin;

    @Value("${rate_limit.public_per_min:45}")
    private int publicPerMin;

    @Value("${rate_limit.telegram_per_min:45}")
    private int telegramPerMin;

    @Value("${rate_limit.loyalty_per_min:45}")
    private int loyaltyPerMin;

    @Value("${rate_limit.write_per_min:15}")
    private int writePerMin;

    @Value("${rate_limit.forecast_per_min:60}")
    private int forecastPerMin;

    @Value("${rate_limit.standard_per_min:200}")
    private int standardPerMin;

    private final ConcurrentHashMap<String, Holder> buckets = new ConcurrentHashMap<>();

    public boolean tryConsume(String pathGroup, String clientKey) {
        String key = pathGroup + ":" + sanitizeKey(clientKey);
        Holder h = buckets.computeIfAbsent(key, k -> new Holder(newBucket(pathGroup)));
        h.touch();
        return h.bucket.tryConsume(1);
    }

    private static String sanitizeKey(String clientKey) {
        if (clientKey == null || clientKey.isEmpty()) {
            return "unknown";
        }
        String s = clientKey.trim();
        return s.length() > 256 ? s.substring(0, 256) : s;
    }

    private Bucket newBucket(String pathGroup) {
        int cap = capacityFor(pathGroup);
        Bandwidth bw = Bandwidth.classic(cap, Refill.intervally(cap, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(bw).build();
    }

    private int capacityFor(String pathGroup) {
        return switch (pathGroup) {
            case "auth" -> authPerMin;
            case "public" -> publicPerMin;
            case "telegram" -> telegramPerMin;
            case "loyalty" -> loyaltyPerMin;
            case "write" -> writePerMin;
            case "forecast" -> forecastPerMin;
            default -> standardPerMin;
        };
    }

    /**
     * Drops idle entries to bound memory (per-instance; no distributed state).
     */
    public void evictIdleEntries() {
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<String, Holder>> it = buckets.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, Holder> e = it.next();
            if (now - e.getValue().lastAccess > EVICTION_IDLE_MS) {
                it.remove();
            }
        }
    }

    private static final class Holder {
        final Bucket bucket;
        volatile long lastAccess = System.currentTimeMillis();

        Holder(Bucket bucket) {
            this.bucket = bucket;
        }

        void touch() {
            lastAccess = System.currentTimeMillis();
        }
    }
}
