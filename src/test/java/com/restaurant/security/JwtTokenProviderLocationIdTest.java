package com.restaurant.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies Stage 1: locationId claim is written to and read from access token.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
class JwtTokenProviderLocationIdTest {

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Test
    void generateAccessTokenWithLocationId_includesClaimAndExtracts() {
        String token = tokenProvider.generateAccessToken(1L, "user1", "ADMIN", 10L, 100L);
        assertThat(token).isNotBlank();

        assertThat(tokenProvider.extractLocationId(token)).isEqualTo(100L);
        assertThat(tokenProvider.extractRestaurantId(token)).isEqualTo(10L);
        assertThat(tokenProvider.extractUsername(token)).isEqualTo("user1");
        assertThat(tokenProvider.validateToken(token)).isTrue();
    }

    @Test
    void generateAccessTokenWithoutLocationId_extractsNull() {
        String token = tokenProvider.generateAccessToken(2L, "user2", "ADMIN", 20L);
        assertThat(tokenProvider.extractLocationId(token)).isNull();
        assertThat(tokenProvider.extractRestaurantId(token)).isEqualTo(20L);
    }

    @Test
    void fiveArgOverload_roundTrip() {
        String token = tokenProvider.generateAccessToken(3L, "u3", "REGULAR_WORKER", 30L, 300L);
        assertThat(tokenProvider.extractLocationId(token)).isEqualTo(300L);
    }
}
