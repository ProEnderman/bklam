package com.restaurant.audit;

import com.restaurant.security.SecurityUtils;
import com.restaurant.service.ActivityLogService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.springframework.web.util.ContentCachingResponseWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Audit trail for ALL /api requests (reads and writes). Keeps payloads size-bounded.
 * This complements domain-level logActivity() calls.
 */
@Slf4j
@RequiredArgsConstructor
public class ApiAuditLogFilter extends OncePerRequestFilter {

    private static final int MAX_BODY_CHARS = 10_000;

    private final ActivityLogService activityLogService;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (uri == null) return true;
        if (!uri.startsWith("/api/")) return true;
        // Avoid logging auth/infra noise and very frequent endpoints.
        return uri.startsWith("/api/auth/")
            || uri.startsWith("/api/public/")
            || uri.startsWith("/api/telegram/")
            || uri.startsWith("/api/internal/forecast-data/")
            || uri.equals("/api/forecast/health")
            || uri.equals("/api/auth/csrf");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
        throws ServletException, IOException {

        Instant start = Instant.now();
        ContentCachingRequestWrapper req = new ContentCachingRequestWrapper(request);
        ContentCachingResponseWrapper res = new ContentCachingResponseWrapper(response);
        int status = 500;
        Throwable error = null;
        try {
            filterChain.doFilter(req, res);
            status = res.getStatus();
        } catch (Throwable t) {
            error = t;
            // If exception bubbles up, container will set status; we log as 500 fallback.
            throw t;
        } finally {
            try {
                Duration dur = Duration.between(start, Instant.now());
                Map<String, Object> newValues = new LinkedHashMap<>();
                newValues.put("method", request.getMethod());
                newValues.put("path", request.getRequestURI());
                newValues.put("query", StringUtils.hasText(request.getQueryString()) ? request.getQueryString() : "");
                newValues.put("status", status);
                newValues.put("durationMs", dur.toMillis());
                newValues.put("ip", request.getRemoteAddr());
                newValues.put("userAgent", headerOrEmpty(request, HttpHeaders.USER_AGENT));
                newValues.put("referer", headerOrEmpty(request, HttpHeaders.REFERER));
                newValues.put("contentType", request.getContentType() != null ? request.getContentType() : "");

                String reqBody = bodyToString(req.getContentAsByteArray(), request.getCharacterEncoding());
                if (!reqBody.isEmpty() && isBodyAllowedForMethod(request.getMethod())) {
                    newValues.put("requestBody", reqBody);
                }
                // We intentionally do NOT store response body (can contain sensitive data).

                if (error != null) {
                    newValues.put("error", error.getClass().getSimpleName());
                    newValues.put("errorMessage", truncate(String.valueOf(error.getMessage())));
                }

                String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
                String action = "API_" + request.getMethod().toUpperCase();
                String desc = request.getMethod() + " " + request.getRequestURI();
                activityLogService.logActivity(action, "API_REQUEST", null, username, desc, null, newValues);
            } catch (Exception e) {
                // Never break request on audit failure.
                log.warn("API audit log failed: {}", e.getMessage());
            } finally {
                res.copyBodyToResponse();
            }
        }
    }

    private static boolean isBodyAllowedForMethod(String method) {
        if (method == null) return false;
        String m = method.toUpperCase();
        return m.equals("POST") || m.equals("PUT") || m.equals("PATCH") || m.equals("DELETE");
    }

    private static String headerOrEmpty(HttpServletRequest req, String name) {
        String v = req.getHeader(name);
        return v != null ? truncate(v) : "";
    }

    private static String bodyToString(byte[] bytes, String encoding) {
        if (bytes == null || bytes.length == 0) return "";
        String cs = (encoding != null && !encoding.isBlank()) ? encoding : StandardCharsets.UTF_8.name();
        String s;
        try {
            s = new String(bytes, cs);
        } catch (Exception e) {
            s = new String(bytes, StandardCharsets.UTF_8);
        }
        return truncate(s);
    }

    private static String truncate(String s) {
        if (s == null) return "";
        if (s.length() <= MAX_BODY_CHARS) return s;
        return s.substring(0, MAX_BODY_CHARS) + "…(truncated)";
    }
}

