package com.restaurant.health;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;

/**
 * Minimal HTTP GET for Actuator health probes (short timeouts, no shared RestTemplate).
 */
final class HttpHealthPing {

    private HttpHealthPing() {
    }

    static Result ping(String baseUrl, String path, int timeoutMs) {
        String base = baseUrl == null ? "" : baseUrl.trim();
        if (base.isEmpty()) {
            return new Result(true, "not_configured", "URL empty — check skipped");
        }
        String normalized = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        String suffix = path.startsWith("/") ? path : "/" + path;
        try {
            URI uri = URI.create(normalized + suffix);
            HttpURLConnection c = (HttpURLConnection) uri.toURL().openConnection();
            c.setRequestMethod("GET");
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(timeoutMs);
            c.setReadTimeout(timeoutMs);
            int code = c.getResponseCode();
            if (code >= 200 && code < 300) {
                return new Result(true, "reachable", "HTTP " + code);
            }
            return new Result(false, "bad_status", "HTTP " + code);
        } catch (IOException e) {
            return new Result(false, "unreachable", e.getClass().getSimpleName());
        }
    }

    record Result(boolean up, String code, String detail) {
    }
}
