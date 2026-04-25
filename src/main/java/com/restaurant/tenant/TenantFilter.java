package com.restaurant.tenant;

import com.restaurant.model.Location;
import com.restaurant.model.Role;
import com.restaurant.repository.LocationRepository;
import com.restaurant.security.UserPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import static jakarta.servlet.http.HttpServletResponse.SC_UNAUTHORIZED;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;

/**
 * Populates TenantContext from the authenticated principal so that all downstream
 * code and RLS can enforce tenant isolation. Runs after JWT auth so the principal is available.
 */
@Component
public class TenantFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(TenantFilter.class);

    private final LocationRepository locationRepository;

    public TenantFilter(LocationRepository locationRepository) {
        this.locationRepository = locationRepository;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (uri == null) return false;
        return uri.startsWith("/api/auth/")
                || uri.startsWith("/api/public/")
                || uri.startsWith("/api/telegram/")
                || uri.startsWith("/swagger-ui")
                || uri.startsWith("/api-docs")
                || uri.startsWith("/v3/api-docs")
                || uri.startsWith("/swagger-resources")
                || uri.startsWith("/webjars/")
                || uri.startsWith("/actuator/")
                || uri.startsWith("/uploads/")
                || uri.equals("/api/forecast/health");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        try {
            if (TenantContext.get() == null) {
                TenantIds ids = extractTenantFromAuth();
                if (ids.locationId() != null || ids.restaurantId() != null) {
                    TenantContext.setLocationAndRestaurant(ids.locationId(), ids.restaurantId());
                }
            }
            Long tenantId = TenantContext.get();
            String uri = req.getRequestURI();
            boolean platform = uri != null && uri.startsWith("/api/platform/");
            boolean internalForecast = uri != null && uri.startsWith("/api/internal/forecast-data/");
            boolean headAdmin = isHeadAdmin();
            boolean allowedNoTenant = (platform && headAdmin) || internalForecast;

            if (!allowedNoTenant && tenantId == null && headAdmin) {
                Long requested = parseRestaurantIdParam(req);
                if (requested != null) {
                    Long locId = locationRepository.findByLegacyRestaurant_Id(requested)
                            .map(Location::getId).orElse(null);
                    TenantContext.setLocationAndRestaurant(locId, requested);
                    tenantId = TenantContext.get();
                } else {
                    // HEAD_ADMIN without explicit restaurantId — historically allowed so some admin flows work;
                    // Warn when hitting tenant-scoped APIs without ?restaurantId= (RLS may see no rows or rely on DB role).
                    if (isTenantRequiredEndpoint(uri)) {
                        log.warn("HEAD_ADMIN request without tenant context (use ?restaurantId=<id> for tenant-scoped data): {} {}",
                                req.getMethod(), uri);
                    }
                    allowedNoTenant = true;
                }
            }

            if (!allowedNoTenant && tenantId == null) {
                res.sendError(SC_UNAUTHORIZED, "Missing tenant context");
                return;
            }
            chain.doFilter(req, res);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Tenant-scoped authenticated paths where HEAD_ADMIN should pass {@code restaurantId} explicitly.
     * Exempt: platform UI, time-override, internal forecast (JWT sets tenant earlier in chain).
     */
    private boolean isTenantRequiredEndpoint(String uri) {
        if (uri == null) return true;
        if (uri.startsWith("/api/platform/")) return false;
        if (uri.startsWith("/api/time-override/")) return false;
        if (uri.startsWith("/api/internal/forecast-data/")) return false;
        return uri.startsWith("/api/");
    }

    private Long parseRestaurantIdParam(HttpServletRequest req) {
        String param = req.getParameter("restaurantId");
        if (param == null || param.isBlank()) return null;
        try { return Long.parseLong(param); } catch (NumberFormatException e) { return null; }
    }

    private record TenantIds(Long locationId, Long restaurantId) {}

    private TenantIds extractTenantFromAuth() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof UserPrincipal principal)) {
            return new TenantIds(null, null);
        }
        Long restaurantId = principal.getRestaurantId();
        Long locationId = principal.getLocationId();
        if (locationId == null && restaurantId != null) {
            locationId = locationRepository.findByLegacyRestaurant_Id(restaurantId)
                    .map(Location::getId)
                    .orElse(null);
        }
        if (locationId != null && restaurantId == null) {
            restaurantId = locationRepository.findById(locationId)
                    .map(Location::getLegacyRestaurantId)
                    .orElse(null);
        }
        if (restaurantId == null) {
            restaurantId = principal.getRestaurantId();
        }
        return new TenantIds(locationId, restaurantId);
    }

    private boolean isHeadAdmin() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof UserPrincipal p
                && p.getRole() == Role.HEAD_ADMIN;
    }
}
