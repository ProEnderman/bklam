package com.restaurant.service;

import com.restaurant.exception.IpVerificationLockedException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * After three wrong email verification codes from the same IP,
 * blocks further login (request-code + verify) for five minutes.
 */
@Slf4j
@Service
public class VerificationIpLockoutService {

    static final int MAX_WRONG_CODE_ATTEMPTS = 3;
    static final int LOCK_MINUTES = 5;

    private static final Duration LOCK_DURATION = Duration.ofMinutes(LOCK_MINUTES);

    private final Clock clock;
    private final boolean trustProxy;

    private final ConcurrentHashMap<String, IpEntry> entries = new ConcurrentHashMap<>();

    @Autowired
    public VerificationIpLockoutService(@Value("${rate_limit.trust_proxy:true}") boolean trustProxy) {
        this(Clock.systemUTC(), trustProxy);
    }

    /** Package-private for unit tests with a fixed clock. */
    VerificationIpLockoutService(Clock clock, boolean trustProxy) {
        this.clock = clock;
        this.trustProxy = trustProxy;
    }

    /**
     * Resolves client IP for lockout (aligned with {@code rate_limit.trust_proxy} / X-Forwarded-For).
     */
    public String resolveClientIp(HttpServletRequest request) {
        if (trustProxy) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                String first = forwarded.split(",")[0].trim();
                if (!first.isEmpty()) {
                    return first;
                }
            }
        }
        String addr = request.getRemoteAddr();
        return addr != null ? addr : "unknown";
    }

    public void assertNotLocked(String clientIp) {
        long now = clock.millis();
        IpEntry entry = entries.get(clientIp);
        if (entry == null) {
            return;
        }
        synchronized (entry) {
            if (entry.blockedUntilMillis > now) {
                int retrySec = (int) Math.ceil((entry.blockedUntilMillis - now) / 1000.0);
                throw new IpVerificationLockedException(retrySec);
            }
            // Истёк срок блокировки — сбрасываем состояние; при отсутствии активной блокировки счётчик неудач не трогаем
            if (entry.blockedUntilMillis > 0) {
                entry.blockedUntilMillis = 0;
                entry.wrongCodeFailures = 0;
            }
        }
    }

    public void recordWrongVerificationCode(String clientIp) {
        long now = clock.millis();
        IpEntry entry = entries.computeIfAbsent(clientIp, k -> new IpEntry());
        synchronized (entry) {
            if (entry.blockedUntilMillis > now) {
                return;
            }
            entry.wrongCodeFailures++;
            if (entry.wrongCodeFailures >= MAX_WRONG_CODE_ATTEMPTS) {
                entry.blockedUntilMillis = now + LOCK_DURATION.toMillis();
                entry.wrongCodeFailures = 0;
                log.warn("Verification IP lockout activated for {} until {}", clientIp,
                        java.time.Instant.ofEpochMilli(entry.blockedUntilMillis));
            }
        }
    }

    public void clearFailures(String clientIp) {
        IpEntry entry = entries.get(clientIp);
        if (entry == null) {
            return;
        }
        synchronized (entry) {
            entry.wrongCodeFailures = 0;
        }
    }

    static final class IpEntry {
        int wrongCodeFailures;
        long blockedUntilMillis;
    }
}
