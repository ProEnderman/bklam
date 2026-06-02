package com.restaurant.util;

import java.util.regex.Pattern;

/**
 * Normalizes and validates auth-related strings before DB access.
 * JPA/Hibernate already binds parameters (primary SQLi defense); this adds depth for login/verify paths.
 */
public final class AuthInputNormalizer {

    public static final int MAX_LOGIN_IDENTIFIER_LENGTH = 320;
    /** BCrypt effectively uses at most 72 bytes; cap avoids abuse and aligns with validators. */
    public static final int MAX_PASSWORD_CHAR_LENGTH = 128;

    private static final Pattern CHALLENGE_ID =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private AuthInputNormalizer() {
    }

    /**
     * Trim, length bound, reject ASCII control characters (incl. NUL) and DEL.
     *
     * @return normalized identifier, or {@code null} if unusable
     */
    public static String normalizeLoginIdentifierForLookup(String raw) {
        if (raw == null) {
            return null;
        }
        String t = raw.strip();
        if (t.isEmpty() || t.length() > MAX_LOGIN_IDENTIFIER_LENGTH) {
            return null;
        }
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (c < 32 || c == 127) {
                return null;
            }
        }
        return t;
    }

    /** Removes NUL bytes only (defense in depth for password handling). */
    public static String stripNulCharsFromPassword(String password) {
        if (password == null) {
            return null;
        }
        return password.indexOf('\u0000') < 0 ? password : password.replace("\u0000", "");
    }

    /**
     * {@code challengeId} must be a canonical UUID string (as produced by {@link java.util.UUID#toString()}).
     *
     * @return normalized id, or {@code null} if invalid
     */
    public static String normalizeChallengeId(String raw) {
        if (raw == null) {
            return null;
        }
        String t = raw.strip();
        return CHALLENGE_ID.matcher(t).matches() ? t : null;
    }
}
