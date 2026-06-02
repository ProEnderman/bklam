package com.restaurant.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.restaurant.forecast.InternalForecastAuthentication;
import com.restaurant.forecast.InternalForecastAuthFilter;
import com.restaurant.audit.ApiAuditLogFilter;
import com.restaurant.security.JwtAuthenticationFilter;
import com.restaurant.security.CustomUserDetailsService;
import com.restaurant.service.ActivityLogService;
import com.restaurant.tenant.TenantFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.http.HttpStatus;

import com.restaurant.exception.ApiErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;

import org.springframework.core.env.Environment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    private final CustomUserDetailsService userDetailsService;
    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final InternalForecastAuthFilter internalForecastAuthFilter;
    private final TenantFilter tenantFilter;
    private final ActivityLogService activityLogService;
    private final Environment environment;
    private final ObjectMapper objectMapper;

    /** Same property as {@link CorsConfig}: comma-separated exact origins (prod: only your HTTPS frontend). */
    @Value("${cors.allowed-origins:http://localhost:3000,http://localhost:5173}")
    private String corsAllowedOrigins;

    @Bean
    public PasswordEncoder passwordEncoder() {
        // Strength 12 - хороший баланс между безопасностью и производительностью
        // (10 - по умолчанию, 12 - более безопасно, но медленнее)
        return new BCryptPasswordEncoder(12);
    }
    
    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
        authProvider.setUserDetailsService(userDetailsService);
        authProvider.setPasswordEncoder(passwordEncoder());
        return authProvider;
    }
    
    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
    
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // Ant-path matcher so the chain matches MockMvc/servlet requests without MVC handler-mapping attributes.
        // (MvcRequestMatcher-based chains can yield "no security filters" for raw MockHttpServletRequest, skipping CSRF.)
        http
            .securityMatcher(new AntPathRequestMatcher("/**"))
            .csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                // Explicit matchers: POST /api/auth/refresh must NOT be ignored (CsrfIT).
                .ignoringRequestMatchers(csrfIgnoredMatchers())
            )
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(authz -> {
                authz.requestMatchers("/api/auth/**").permitAll()
                        .requestMatchers("/api/public/**").permitAll()
                        .requestMatchers("/api/telegram/**").permitAll()
                        .requestMatchers(
                                "/swagger-ui/**",
                                "/swagger-ui.html",
                                "/swagger-ui/index.html",
                                "/api-docs/**",
                                "/v3/api-docs/**",
                                "/swagger-resources/**",
                                "/webjars/**"
                        ).permitAll()
                        .requestMatchers("/actuator/health", "/actuator/info", "/actuator/metrics", "/actuator/metrics/**")
                                .permitAll()
                        .requestMatchers("/api/forecast/health").permitAll()
                        .requestMatchers("/api/internal/forecast-data/**").access(internalForecastOnly())
                        .requestMatchers("/uploads/**").permitAll();
                if (!TimeOverrideSupport.isAllowed(environment)) {
                    authz.requestMatchers("/api/time-override/**").denyAll();
                } else {
                    authz.requestMatchers("/api/time-override/**").hasRole("HEAD_ADMIN");
                }
                authz.anyRequest().authenticated();
            })
            .exceptionHandling(exceptions -> exceptions
                .authenticationEntryPoint((request, response, authException) -> {
                    try {
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        response.setContentType("application/json");
                        response.setCharacterEncoding("UTF-8");
                        ApiErrorResponse body = ApiErrorResponse.of((HttpServletRequest) request, HttpStatus.UNAUTHORIZED,
                                "UNAUTHORIZED", "Требуется аутентификация.");
                        objectMapper.writeValue(response.getWriter(), body);
                    } catch (IOException e) {
                        log.debug("Failed to write 401 body", e);
                    }
                })
                .accessDeniedHandler(accessDeniedHandler())
            )
            .addFilterBefore(new CreateRestaurantLoggingFilter(), CsrfFilter.class)
            .authenticationProvider(authenticationProvider())
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(internalForecastAuthFilter, JwtAuthenticationFilter.class)
            .addFilterAfter(tenantFilter, InternalForecastAuthFilter.class)
            // Audit after SecurityContext is available, before tenant is cleared
            .addFilterAfter(new ApiAuditLogFilter(activityLogService), SecurityContextHolderFilter.class);
        
        return http.build();
    }

    @Bean
    public AccessDeniedHandler accessDeniedHandler() {
        return (request, response, accessDeniedException) -> {
            log.warn("Access denied (403): URI={}, method={}, reason={}",
                    request.getRequestURI(), request.getMethod(), accessDeniedException.getMessage());
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            try {
                ApiErrorResponse body = ApiErrorResponse.of((HttpServletRequest) request, HttpStatus.FORBIDDEN,
                        "ACCESS_DENIED", "Доступ запрещён.");
                objectMapper.writeValue(response.getWriter(), body);
            } catch (IOException e) {
                log.debug("Failed to write 403 body", e);
            }
        };
    }

    /**
     * Paths where CSRF is not checked. POST /api/auth/refresh is omitted so missing X-XSRF-TOKEN yields 403
     * before the controller. GET /api/auth/csrf is not listed (safe method; CsrfFilter still sets XSRF-TOKEN cookie).
     */
    /** Same matchers as {@link #securityFilterChain(HttpSecurity)} CSRF ignore list; package-private for CsrfIT. */
    static RequestMatcher[] csrfIgnoredMatchers() {
        return new RequestMatcher[]{
                new AntPathRequestMatcher("/api/auth/login/request-code", "POST"),
                new AntPathRequestMatcher("/api/auth/login/verify", "POST"),
                new AntPathRequestMatcher("/api/auth/login/verify-legacy", "POST"),
                new AntPathRequestMatcher("/api/auth/logout", "POST"),
                new AntPathRequestMatcher("/api/public/**"),
                new AntPathRequestMatcher("/api/telegram/**"),
                new AntPathRequestMatcher("/api/internal/forecast-data/**"),
                new AntPathRequestMatcher("/api/booking-orders/**"),
                new AntPathRequestMatcher("/api/pricing/**"),
                new AntPathRequestMatcher("/api/time-override/**"),
                new AntPathRequestMatcher("/api/booking-notifications/**"),
                // Demo seed: called from curl/scripts with session cookies (see scripts/seed-demo-orders.sh)
                new AntPathRequestMatcher("/api/demo/**", "POST"),
        };
    }

    /** Only allow InternalForecastAuthentication (set by InternalForecastAuthFilter); normal JWT -> 403. */
    private static AuthorizationManager<RequestAuthorizationContext> internalForecastOnly() {
        return (authentication, context) -> {
            Authentication auth = authentication.get();
            boolean allow = auth != null && auth instanceof InternalForecastAuthentication;
            return new AuthorizationDecision(allow);
        };
    }
    
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> origins = Arrays.stream(corsAllowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        configuration.setAllowedOrigins(origins);
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Arrays.asList(
                "Origin",
                "Content-Type",
                "Accept",
                "Authorization",
                "X-XSRF-TOKEN",
                "X-Time-Offset-Ms",
                "X-Request-Id",
                "X-Guest-Session"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}

