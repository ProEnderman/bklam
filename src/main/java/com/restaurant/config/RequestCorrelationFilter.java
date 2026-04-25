package com.restaurant.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Propagate {@code X-Request-Id} (or generate), set MDC {@code reqId} for log pattern, echo header on response.
 * One access line: method, path, status, duration (no bodies / PII).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestCorrelationFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "reqId";

    private static final Logger ACCESS = LoggerFactory.getLogger("com.restaurant.http.access");

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {
        String id = request.getHeader(HEADER);
        if (id == null || id.isBlank()) {
            id = UUID.randomUUID().toString();
        } else if (id.length() > 128) {
            id = id.substring(0, 128);
        }
        MDC.put(MDC_KEY, id);
        response.setHeader(HEADER, id);
        long t0 = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            long ms = (System.nanoTime() - t0) / 1_000_000L;
            if (request.getRequestURI() != null && !request.getRequestURI().startsWith("/actuator")) {
                ACCESS.info("{} {} -> {} in {}ms",
                        request.getMethod(),
                        request.getRequestURI(),
                        response.getStatus(),
                        ms);
            }
            MDC.remove(MDC_KEY);
        }
    }
}
