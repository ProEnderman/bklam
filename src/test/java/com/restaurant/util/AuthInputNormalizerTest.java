package com.restaurant.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AuthInputNormalizerTest {

    @Test
    void normalizeLogin_trimsAndAcceptsValidEmail() {
        assertThat(AuthInputNormalizer.normalizeLoginIdentifierForLookup("  a@b.com  "))
                .isEqualTo("a@b.com");
    }

    @Test
    void normalizeLogin_rejectsNulAndControlChars() {
        assertThat(AuthInputNormalizer.normalizeLoginIdentifierForLookup("a\u0000@b.com")).isNull();
        assertThat(AuthInputNormalizer.normalizeLoginIdentifierForLookup("a\n@b.com")).isNull();
    }

    @Test
    void normalizeLogin_rejectsTooLong() {
        assertThat(AuthInputNormalizer.normalizeLoginIdentifierForLookup("x".repeat(400))).isNull();
    }

    @Test
    void stripNul_removesNulFromPassword() {
        assertThat(AuthInputNormalizer.stripNulCharsFromPassword("ab\u0000cd")).isEqualTo("abcd");
    }

    @Test
    void normalizeChallenge_acceptsUuid() {
        String id = "550e8400-e29b-41d4-a716-446655440000";
        assertThat(AuthInputNormalizer.normalizeChallengeId("  " + id + "  ")).isEqualTo(id);
    }

    @Test
    void normalizeChallenge_rejectsNonUuid() {
        assertThat(AuthInputNormalizer.normalizeChallengeId("'; DROP TABLE users;--")).isNull();
        assertThat(AuthInputNormalizer.normalizeChallengeId("not-a-uuid")).isNull();
    }
}
