package com.restaurant.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.restaurant.exception.ApiErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Path-group + client key rate limiting (Bucket4j in-memory). Returns 429 when exceeded.
 */
@Component
@RequiredArgsConstructor
public class RateLimitInterceptor implements HandlerInterceptor {

    private final InMemoryBucketRateLimiter rateLimiter;
    private final RateLimitPathGroupResolver pathGroupResolver;
    private final ObjectMapper objectMapper;

    @Value("${rate_limit.trust_proxy:true}")
    private boolean trustProxy;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String path = request.getRequestURI();
        String pathGroup = pathGroupResolver.resolve(path, request.getMethod());
        String clientKey = resolveClientKey(request);

        if (rateLimiter.tryConsume(pathGroup, clientKey)) {
            return true;
        }

        response.setStatus(429);
        response.setHeader("Retry-After", "60");
        response.setContentType("application/json;charset=UTF-8");
        ApiErrorResponse body = ApiErrorResponse.of(request, HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                "Too many requests");
        response.getWriter().write(objectMapper.writeValueAsString(body));
        return false;
    }

    /**
     * Prefer authenticated user id when present; else guest session header; else client IP (with optional X-Forwarded-For).
     */
    private String resolveClientKey(HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null
                && auth.isAuthenticated()
                && !(auth instanceof AnonymousAuthenticationToken)) {
            Object principal = auth.getPrincipal();
            if (principal instanceof UserDetails ud) {
                return "u:" + ud.getUsername();
            }
            if (principal instanceof String s && !"anonymousUser".equals(s)) {
                return "u:" + s;
            }
        }
        return guestSessionOrIp(request);
    }

    private String guestSessionOrIp(HttpServletRequest request) {
        String guestSession = request.getHeader("X-Guest-Session");
        if (guestSession != null && !guestSession.isBlank()) {
            return "gs:" + guestSession.trim();
        }
        if (trustProxy) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                String first = forwarded.split(",")[0].trim();
                if (!first.isEmpty()) {
                    return first;
                }
            }
        }
        return request.getRemoteAddr() != null ? request.getRemoteAddr() : "unknown";
    }

    public void evict() {
        rateLimiter.evictIdleEntries();
    }
}
