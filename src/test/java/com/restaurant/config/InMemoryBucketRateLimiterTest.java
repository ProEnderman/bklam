package com.restaurant.config;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class InMemoryBucketRateLimiterTest {

    @Test
    void allowsUpToCapacityThenBlocks() {
        InMemoryBucketRateLimiter limiter = new InMemoryBucketRateLimiter();
        ReflectionTestUtils.setField(limiter, "authPerMin", 3);
        ReflectionTestUtils.setField(limiter, "standardPerMin", 200);

        for (int i = 0; i < 3; i++) {
            assertThat(limiter.tryConsume("auth", "ip1")).isTrue();
        }
        assertThat(limiter.tryConsume("auth", "ip1")).isFalse();
    }

    @Test
    void differentClientsAreIndependent() {
        InMemoryBucketRateLimiter limiter = new InMemoryBucketRateLimiter();
        ReflectionTestUtils.setField(limiter, "authPerMin", 1);

        assertThat(limiter.tryConsume("auth", "a")).isTrue();
        assertThat(limiter.tryConsume("auth", "a")).isFalse();
        assertThat(limiter.tryConsume("auth", "b")).isTrue();
    }
}
