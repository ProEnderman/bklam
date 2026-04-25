package com.restaurant.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Logs POST requests to /api/platform/restaurants (create restaurant) and whether
 * X-XSRF-TOKEN header is present, to debug "create on first click" / CSRF issues.
 */
public class CreateRestaurantLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(CreateRestaurantLoggingFilter.class);

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String uri = request.getRequestURI();
        return !uri.contains("/platform/restaurants");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = request.getHeader("X-XSRF-TOKEN");
        boolean present = token != null && !token.isBlank();
        log.info("Create restaurant attempt: URI={}, X-XSRF-TOKEN present={}, length={}",
                request.getRequestURI(), present, present ? token.length() : 0);
        filterChain.doFilter(request, response);
    }
}
