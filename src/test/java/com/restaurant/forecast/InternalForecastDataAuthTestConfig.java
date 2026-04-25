package com.restaurant.forecast;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Minimal security config for InternalForecastDataAuthIT: only internal forecast path + filter.
 */
@Configuration
@EnableWebSecurity
public class InternalForecastDataAuthTestConfig {

    public static final String TEST_NORMAL_USER_HEADER = "X-Test-Normal-User";

    @Bean
    public AuthorizationManager<RequestAuthorizationContext> internalForecastOnly() {
        return (authentication, context) -> {
            var auth = authentication.get();
            boolean allow = auth != null && auth instanceof InternalForecastAuthentication;
            return new AuthorizationDecision(allow);
        };
    }

    /** Sets a normal (non-internal) user in SecurityContext when header is present for 403 test. */
    @Bean
    public OncePerRequestFilter testNormalUserFilter() {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                           FilterChain chain) throws ServletException, IOException {
                if ("true".equalsIgnoreCase(request.getHeader(TEST_NORMAL_USER_HEADER))) {
                    var auth = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                            "user@test.com",
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))
                    );
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
                chain.doFilter(request, response);
            }
        };
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                          InternalForecastAuthFilter internalForecastAuthFilter,
                                          OncePerRequestFilter testNormalUserFilter,
                                          AuthorizationManager<RequestAuthorizationContext> internalForecastOnly) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/internal/forecast-data/**").access(internalForecastOnly)
                .anyRequest().permitAll()
            )
            .addFilterBefore(internalForecastAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(testNormalUserFilter, InternalForecastAuthFilter.class);
        return http.build();
    }
}
