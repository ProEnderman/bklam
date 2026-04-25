package com.restaurant.forecast;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;

/**
 * Issues short-lived JWTs for the forecasting service. Secret is base64-encoded (FORECAST_INTERNAL_JWT_SECRET_B64).
 */
@Service
public class InternalForecastJwtService {

    @Value("${forecast.internal_jwt.secret}")
    private String secretBase64;

    @Value("${forecast.internal_jwt.issuer:rms-backend}")
    private String issuer;

    @Value("${forecast.internal_jwt.ttl_minutes:5}")
    private long ttlMinutes;

    public String issue(long tenantId) {
        Instant now = Instant.now();
        byte[] keyBytes = Base64.getDecoder().decode(secretBase64.trim());
        SecretKey key = Keys.hmacShaKeyFor(keyBytes);
        return Jwts.builder()
                .issuer(issuer)
                .subject("forecast-service")
                .claim("tenant_id", tenantId)
                .claim("scope", "forecast")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(Duration.ofMinutes(ttlMinutes))))
                .signWith(key)
                .compact();
    }
}
