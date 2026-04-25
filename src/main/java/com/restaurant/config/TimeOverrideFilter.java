package com.restaurant.config;

import com.restaurant.util.TimeUtils;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Conditional;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Читает заголовок {@code X-Time-Offset-Ms} и применяет смещение только на время этого запроса
 * (без влияния на параллельные запросы).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
@Conditional(TimeOverrideAllowedCondition.class)
public class TimeOverrideFilter extends OncePerRequestFilter {

    static final String HEADER = "X-Time-Offset-Ms";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        try {
            String header = request.getHeader(HEADER);
            if (header != null && !header.isBlank()) {
                try {
                    long offsetMs = Long.parseLong(header.trim());
                    TimeUtils.bindRequestOffsetMs(offsetMs);
                } catch (NumberFormatException ignored) {
                    // невалидный заголовок — реальное время
                }
            }
            filterChain.doFilter(request, response);
        } finally {
            TimeUtils.clearRequestBinding();
        }
    }
}
