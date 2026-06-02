package com.restaurant.security;

import com.restaurant.observability.BusinessMetrics;
import com.restaurant.util.AuthInputNormalizer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Slf4j
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider tokenProvider;
    private final UserDetailsService userDetailsService;
    private final BusinessMetrics businessMetrics;

    public JwtAuthenticationFilter(
            JwtTokenProvider tokenProvider,
            UserDetailsService userDetailsService,
            BusinessMetrics businessMetrics) {
        this.tokenProvider = tokenProvider;
        this.userDetailsService = userDetailsService;
        this.businessMetrics = businessMetrics;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        
        // Пропускаем Swagger UI и публичные auth endpoints
        String path = request.getRequestURI();
        if (path.startsWith("/swagger-ui") || 
            path.startsWith("/api-docs") || 
            path.startsWith("/v3/api-docs") ||
            path.startsWith("/swagger-resources") ||
            path.startsWith("/webjars") ||
            path.equals("/api/auth/login/request-code") ||
            path.equals("/api/auth/login/verify") ||
            path.equals("/api/auth/login/verify-legacy") ||
            path.equals("/api/auth/refresh") ||
            path.equals("/api/auth/logout")) {
            filterChain.doFilter(request, response);
            return;
        }
        
        // /api/auth/me требует аутентификации, поэтому обрабатываем его через JWT фильтр
        
        String token = getTokenFromCookie(request);
        log.debug("JWT Filter - Path: {}, Token found: {}", path, token != null);
        
        if (token != null && tokenProvider.validateToken(token)) {
            try {
                String username = tokenProvider.extractUsername(token);
                String normalized = AuthInputNormalizer.normalizeLoginIdentifierForLookup(username);
                if (normalized == null) {
                    log.warn("JWT Filter - rejected malformed username from token");
                    businessMetrics.incrementAuthFailure();
                } else {
                    log.debug("JWT Filter - Valid token for user: {}", normalized);
                    UserDetails userDetails = userDetailsService.loadUserByUsername(normalized);

                    UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                            userDetails,
                            null,
                            userDetails.getAuthorities()
                        );
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                    log.debug("JWT Filter - Authentication set for user: {}", normalized);
                }
            } catch (Exception ex) {
                businessMetrics.incrementAuthFailure();
                log.error("Cannot set user authentication: {}", ex.getMessage(), ex);
            }
        } else {
            if (token != null) {
                businessMetrics.incrementAuthFailure();
                log.warn("JWT Filter - Invalid token for path: {}", path);
            } else {
                log.debug("JWT Filter - No token found for path: {}", path);
            }
        }
        
        filterChain.doFilter(request, response);
    }
    
    private String getTokenFromCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if ("access_token".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}

