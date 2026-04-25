package com.restaurant.config;

import org.springframework.stereotype.Component;

/**
 * Maps request URI + HTTP method to a rate-limit bucket.
 * First matching prefix wins (most specific groups before generic {@code write} / {@code standard}).
 */
@Component
public class RateLimitPathGroupResolver {

    public String resolve(String requestUri, String method) {
        String uri = requestUri != null ? requestUri : "";
        String m = method != null ? method.toUpperCase() : "GET";
        boolean mutating = "POST".equals(m) || "PUT".equals(m) || "PATCH".equals(m) || "DELETE".equals(m);

        if (uri.startsWith("/api/auth/")) {
            return "auth";
        }
        if (uri.startsWith("/api/public/")) {
            return "public";
        }
        if (uri.startsWith("/api/telegram/") || uri.contains("/telegram-payment/")) {
            return "telegram";
        }
        if (uri.startsWith("/api/loyalty/")) {
            return "loyalty";
        }
        if (uri.startsWith("/api/forecast/") || uri.startsWith("/api/forecast-data/")) {
            return "forecast";
        }
        if (mutating && isWriteHeavyPath(uri)) {
            return "write";
        }
        return "standard";
    }

    private boolean isWriteHeavyPath(String uri) {
        if (uri.startsWith("/api/orders")) {
            return true;
        }
        if (uri.startsWith("/api/booking-orders")) {
            return true;
        }
        if (uri.startsWith("/api/internal/")) {
            return true;
        }
        return false;
    }
}
