package com.restaurant.service;

import com.restaurant.exception.IpVerificationLockedException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VerificationIpLockoutServiceTest {

    @Test
    void locksAfterThreeWrongCodes() {
        Instant start = Instant.parse("2026-05-12T12:00:00Z");
        Clock clock = Clock.fixed(start, ZoneOffset.UTC);
        VerificationIpLockoutService svc = new VerificationIpLockoutService(clock, false);
        String ip = "203.0.113.1";

        svc.recordWrongVerificationCode(ip);
        svc.recordWrongVerificationCode(ip);
        svc.assertNotLocked(ip);

        svc.recordWrongVerificationCode(ip);
        assertThatThrownBy(() -> svc.assertNotLocked(ip))
                .isInstanceOf(IpVerificationLockedException.class)
                .satisfies(ex -> assertThat(((IpVerificationLockedException) ex).getRetryAfterSeconds())
                        .isEqualTo(5 * 60));
    }

    @Test
    void freshServiceAfterLockWindowAllowsTraffic() {
        Instant start = Instant.parse("2026-05-12T12:00:00Z");
        Clock clock = Clock.fixed(start, ZoneOffset.UTC);
        VerificationIpLockoutService locked = new VerificationIpLockoutService(clock, false);
        String ip = "203.0.113.9";
        locked.recordWrongVerificationCode(ip);
        locked.recordWrongVerificationCode(ip);
        locked.recordWrongVerificationCode(ip);
        assertThatThrownBy(() -> locked.assertNotLocked(ip)).isInstanceOf(IpVerificationLockedException.class);

        Instant after = start.plus(Duration.ofMinutes(5)).plusSeconds(1);
        VerificationIpLockoutService cleared = new VerificationIpLockoutService(Clock.fixed(after, ZoneOffset.UTC), false);
        cleared.assertNotLocked(ip);
    }

    @Test
    void lockExpiresWithinSameServiceInstance() {
        Instant start = Instant.parse("2026-05-12T12:00:00Z");
        MutableClock clock = new MutableClock(start, ZoneOffset.UTC);
        VerificationIpLockoutService svc = new VerificationIpLockoutService(clock, false);
        String ip = "198.51.100.2";

        svc.recordWrongVerificationCode(ip);
        svc.recordWrongVerificationCode(ip);
        svc.recordWrongVerificationCode(ip);
        assertThatThrownBy(() -> svc.assertNotLocked(ip)).isInstanceOf(IpVerificationLockedException.class);

        clock.setInstant(start.plus(Duration.ofMinutes(5)).plusMillis(1));
        svc.assertNotLocked(ip);
        svc.recordWrongVerificationCode(ip);
        svc.assertNotLocked(ip);
    }

    @Test
    void clearFailuresResetsCounterBeforeLock() {
        Instant start = Instant.parse("2026-05-12T12:00:00Z");
        Clock clock = Clock.fixed(start, ZoneOffset.UTC);
        VerificationIpLockoutService svc = new VerificationIpLockoutService(clock, false);
        String ip = "192.0.2.3";

        svc.recordWrongVerificationCode(ip);
        svc.recordWrongVerificationCode(ip);
        svc.clearFailures(ip);
        svc.recordWrongVerificationCode(ip);
        svc.recordWrongVerificationCode(ip);
        svc.assertNotLocked(ip);
    }

    static final class MutableClock extends Clock {
        private Instant instant;
        private final ZoneOffset zone;

        MutableClock(Instant instant, ZoneOffset zone) {
            this.instant = instant;
            this.zone = zone;
        }

        void setInstant(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneOffset getZone() {
            return zone;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
