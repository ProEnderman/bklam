package com.restaurant.security;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.restaurant.model.Role;
import com.restaurant.model.UserPermission;
import com.restaurant.util.AuthInputNormalizer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Loads {@link UserPrincipal} for every authenticated request (JWT filter runs before {@code TenantFilter}).
 * <p>
 * Must not rely on the tenant JDBC pool with RLS session variables unset — otherwise {@code users} rows with a
 * non-null {@code restaurant_id} are invisible and tenant ids in the principal are wrong, breaking RLS for
 * ingredients and other tenant tables.
 * <p>
 * Uses {@code platformJdbcTemplate} (see {@code app.datasource.platform}): production should use a role that can
 * read {@code users} regardless of {@code app.current_restaurant_id} (same DB URL with {@code APP_PLATFORM_DB_*}
 * credentials is fine when that role bypasses RLS or has a suitable policy).
 */
@Slf4j
@Service
public class CustomUserDetailsService implements UserDetailsService {

    private static final String USER_LOOKUP_SQL = """
            SELECT id, username, password_hash, role, restaurant_id, location_id, is_active, permissions
            FROM users
            WHERE lower(username) = lower(?)
            """;

    private final JdbcTemplate platformJdbcTemplate;
    private final ObjectMapper objectMapper;

    public CustomUserDetailsService(
            @Qualifier("platformJdbcTemplate") JdbcTemplate platformJdbcTemplate,
            ObjectMapper objectMapper) {
        this.platformJdbcTemplate = platformJdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        String normalized = AuthInputNormalizer.normalizeLoginIdentifierForLookup(username);
        if (normalized == null) {
            log.warn("Rejected malformed username for lookup");
            throw new UsernameNotFoundException("User not found");
        }
        log.debug("Loading user by username (platform JDBC): {}", normalized);
        try {
            UserPrincipal principal = platformJdbcTemplate.queryForObject(
                    USER_LOOKUP_SQL,
                    (rs, rowNum) -> mapRow(rs),
                    normalized
            );
            log.debug("User found: ID={}, username={}, role={}, active={}",
                    principal.getId(), principal.getUsername(), principal.getRole(), principal.isEnabled());
            return principal;
        } catch (EmptyResultDataAccessException e) {
            log.error("User not found with username: {}", normalized);
            throw new UsernameNotFoundException("User not found with username: " + normalized);
        }
    }

    private UserPrincipal mapRow(ResultSet rs) throws SQLException {
        Long id = rs.getLong("id");
        String uname = rs.getString("username");
        String passwordHash = rs.getString("password_hash");
        Role role = Role.valueOf(rs.getString("role"));
        Long restaurantId = rs.getObject("restaurant_id", Long.class);
        Long locationId = rs.getObject("location_id", Long.class);
        boolean active = rs.getBoolean("is_active");
        List<UserPermission> permissions = readPermissions(rs);
        return new UserPrincipal(
                id,
                uname,
                passwordHash,
                role,
                restaurantId,
                locationId,
                active,
                permissions
        );
    }

    private List<UserPermission> readPermissions(ResultSet rs) throws SQLException {
        String json = rs.getString("permissions");
        if (json == null || json.isBlank() || "null".equalsIgnoreCase(json.trim())) {
            return Collections.emptyList();
        }
        try {
            String[] names = objectMapper.readValue(json, String[].class);
            List<UserPermission> out = new ArrayList<>();
            for (String n : names) {
                if (n == null || n.isBlank()) {
                    continue;
                }
                try {
                    out.add(UserPermission.valueOf(n.trim()));
                } catch (IllegalArgumentException ex) {
                    log.warn("Unknown permission '{}' in users.permissions — skipped", n);
                }
            }
            return out;
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse users.permissions JSON, treating as empty: {}", e.getMessage());
            return Collections.emptyList();
        }
    }
}
