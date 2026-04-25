package com.restaurant.forecast;

import com.restaurant.tenant.TenantContext;
import io.jsonwebtoken.Claims;
import org.springframework.security.core.context.SecurityContextHolder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.util.Base64;

/**
 * Validates internal JWT for /api/internal/forecast-data/** and sets TenantContext from tenant_id claim.
 * Rejects if signature invalid, scope != forecast, or tenant_id missing.
 */
@Slf4j
@Component
public class InternalForecastAuthFilter extends OncePerRequestFilter {

    @Value("${forecast.internal_jwt.secret}")
    private String secretBase64;

    @Value("${forecast.internal_jwt.issuer:rms-backend}")
    private String issuer;

    private static final String PATH_PREFIX = "/api/internal/forecast-data/";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null || !path.startsWith(PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String auth = request.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("{\"error\":\"Missing or invalid Authorization\"}");
            return;
        }
        String token = auth.substring(7).trim();
        try {
            byte[] keyBytes = Base64.getDecoder().decode(secretBase64.trim());
            SecretKey key = Keys.hmacShaKeyFor(keyBytes);
            Claims claims = Jwts.parser().verifyWith(key).requireIssuer(issuer).build().parseSignedClaims(token).getPayload();
            if (!"forecast".equals(claims.get("scope", String.class))) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.getWriter().write("{\"error\":\"Invalid scope\"}");
                return;
            }
            Number tenantIdObj = claims.get("tenant_id", Number.class);
            if (tenantIdObj == null) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.getWriter().write("{\"error\":\"Missing tenant_id\"}");
                return;
            }
            long tenantId = tenantIdObj.longValue();
            TenantContext.set(tenantId);
            SecurityContextHolder.getContext().setAuthentication(new InternalForecastAuthentication(tenantId));
            try {
                chain.doFilter(request, response);
            } finally {
                SecurityContextHolder.clearContext();
                TenantContext.clear();
            }
        } catch (Exception e) {
            log.debug("Internal forecast JWT validation failed: {}", e.getMessage());
            var existing = SecurityContextHolder.getContext().getAuthentication();
            if (existing != null && existing.isAuthenticated()) {
                chain.doFilter(request, response);
                return;
            }
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("{\"error\":\"Invalid token\"}");
        }
    }
}
