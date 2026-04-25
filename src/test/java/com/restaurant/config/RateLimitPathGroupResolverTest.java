package com.restaurant.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimitPathGroupResolverTest {

    private final RateLimitPathGroupResolver resolver = new RateLimitPathGroupResolver();

    @Test
    void authPrefixWins() {
        assertThat(resolver.resolve("/api/auth/login", "POST")).isEqualTo("auth");
    }

    @Test
    void publicPrefixWinsOverWriteForOrders() {
        assertThat(resolver.resolve("/api/public/orders", "POST")).isEqualTo("public");
    }

    @Test
    void postOrdersIsWrite() {
        assertThat(resolver.resolve("/api/orders", "POST")).isEqualTo("write");
    }

    @Test
    void getOrdersIsStandard() {
        assertThat(resolver.resolve("/api/orders", "GET")).isEqualTo("standard");
    }

    @Test
    void loyaltyPostUsesLoyaltyBucket() {
        assertThat(resolver.resolve("/api/loyalty/bonus/earn", "POST")).isEqualTo("loyalty");
    }

    @Test
    void telegramPaymentUsesTelegramBucket() {
        assertThat(resolver.resolve("/api/telegram-payment/callback", "POST")).isEqualTo("telegram");
    }
}
