package com.restaurant.forecast;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

/**
 * Authentication set only by InternalForecastAuthFilter when internal JWT is valid.
 * SecurityConfig restricts /api/internal/forecast-data/** to hasAuthority(INTERNAL_FORECAST).
 */
public class InternalForecastAuthentication extends AbstractAuthenticationToken {

    /** Authority required for /api/internal/forecast-data/** — only this auth type has it. */
    public static final String AUTHORITY_INTERNAL_FORECAST = "INTERNAL_FORECAST";

    private static final List<GrantedAuthority> AUTHORITIES =
            List.of(new SimpleGrantedAuthority(AUTHORITY_INTERNAL_FORECAST));

    private final long tenantId;

    public InternalForecastAuthentication(long tenantId) {
        super(AUTHORITIES);
        this.tenantId = tenantId;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Long getPrincipal() {
        return tenantId;
    }
}
