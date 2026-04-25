package com.restaurant.util;

public final class LogSanitizer {

    private LogSanitizer() {}

    public static String tokenState(String token) {
        if (token == null) return "missing";
        String trimmed = token.trim();
        if (trimmed.isEmpty()) return "empty";
        return "present(len=" + trimmed.length() + ")";
    }

    public static String secretState(String secret) {
        if (secret == null) return "missing";
        if (secret.isEmpty()) return "empty";
        return "configured(len=" + secret.length() + ")";
    }
}
