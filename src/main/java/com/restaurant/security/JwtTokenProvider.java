package com.restaurant.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Component
public class JwtTokenProvider {

    private static final Logger log = LoggerFactory.getLogger(JwtTokenProvider.class);
    
    @Value("${jwt.secret}")
    private String secret;
    
    @Value("${jwt.access-token-expiration:900000}") // 15 minutes
    private long accessTokenExpiration;
    
    @Value("${jwt.refresh-token-expiration:2592000000}") // 30 days
    private long refreshTokenExpiration;
    
    private static boolean keyInitLogged = false;
    
    private SecretKey getSigningKey() {
        if (!keyInitLogged) {
            log.debug("JWT signing key initialized");
            keyInitLogged = true;
        }
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }
    
    public String generateAccessToken(Long userId, String username, String role, Long restaurantId) {
        return generateAccessToken(userId, username, role, restaurantId, null);
    }

    public String generateAccessToken(Long userId, String username, String role, Long restaurantId, Long locationId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", userId);
        claims.put("username", username);
        claims.put("role", role);
        if (restaurantId != null) {
            claims.put("restaurantId", restaurantId);
        }
        if (locationId != null) {
            claims.put("locationId", locationId);
        }

        return Jwts.builder()
            .claims(claims)
            .subject(username)
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + accessTokenExpiration))
            .signWith(getSigningKey())
            .compact();
    }
    
    public String generateRefreshToken() {
        return java.util.UUID.randomUUID().toString();
    }
    
    public Claims extractAllClaims(String token) {
        return Jwts.parser()
            .verifyWith(getSigningKey())
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
    
    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }
    
    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }
    
    @Deprecated
    public String extractEmail(String token) {
        // Для обратной совместимости
        return extractUsername(token);
    }
    
    public Long extractUserId(String token) {
        return extractClaim(token, claims -> claims.get("userId", Long.class));
    }
    
    public String extractRole(String token) {
        return extractClaim(token, claims -> claims.get("role", String.class));
    }
    
    public Long extractRestaurantId(String token) {
        return extractClaim(token, claims -> {
            Object restaurantId = claims.get("restaurantId");
            return restaurantId != null ? ((Number) restaurantId).longValue() : null;
        });
    }

    public Long extractLocationId(String token) {
        return extractClaim(token, claims -> {
            Object locationId = claims.get("locationId");
            return locationId != null ? ((Number) locationId).longValue() : null;
        });
    }
    
    public Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }
    
    public boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }
    
    public boolean validateToken(String token) {
        try {
            return !isTokenExpired(token);
        } catch (Exception e) {
            return false;
        }
    }
}

