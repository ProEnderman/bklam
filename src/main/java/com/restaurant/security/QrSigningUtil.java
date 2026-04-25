package com.restaurant.security;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;

@Component
public class QrSigningUtil {

    private static final String HMAC_ALGO = "HmacSHA256";
    private static final long DEFAULT_TTL_SECONDS = 300;
    @Value("${qr.signing.secret}")
    private String secret;

    @PostConstruct
    void validateSecret() {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("qr.signing.secret must be set via QR_SIGNING_SECRET");
        }
        // Ensure HMAC secret has adequate entropy regardless of profile.
        if (secret.trim().length() < 32) {
            throw new IllegalStateException("qr.signing.secret must be at least 32 characters");
        }
    }

    private String getEffectiveSecret() {
        return secret;
    }

    public String sign(Long restaurantId, Long tableId) {
        long exp = Instant.now().plusSeconds(DEFAULT_TTL_SECONDS).getEpochSecond();
        return sign(restaurantId, tableId, exp);
    }

    /** Подпись токена с заданной датой истечения (для печатного QR-меню ресторана). */
    public String sign(Long restaurantId, Long tableId, long expEpochSeconds) {
        String payload = restaurantId + ":" + tableId + ":" + expEpochSeconds;
        String sig = hmac(payload);
        return payload + ":" + sig;
    }

    /** Подпись токена с датой истечения из LocalDateTime. */
    public String sign(Long restaurantId, Long tableId, LocalDateTime expiresAt) {
        long exp = expiresAt.toInstant(ZoneOffset.UTC).getEpochSecond();
        return sign(restaurantId, tableId, exp);
    }

    public boolean verify(String token) {
        if (token == null || token.isBlank()) return false;
        String[] parts = token.split(":");
        if (parts.length != 4) return false;
        try {
            long exp = Long.parseLong(parts[2]);
            if (Instant.now().getEpochSecond() > exp) return false;
            String payload = parts[0] + ":" + parts[1] + ":" + parts[2];
            return MessageDigest.isEqual(
                hmac(payload).getBytes(StandardCharsets.UTF_8),
                parts[3].getBytes(StandardCharsets.UTF_8)
            );
        } catch (NumberFormatException e) {
            return false;
        }
    }

    public Long extractRestaurantId(String token) {
        if (token == null) return null;
        String[] parts = token.split(":");
        if (parts.length < 1) return null;
        try { return Long.parseLong(parts[0]); } catch (NumberFormatException e) { return null; }
    }

    public Long extractTableId(String token) {
        if (token == null) return null;
        String[] parts = token.split(":");
        if (parts.length < 2) return null;
        try { return Long.parseLong(parts[1]); } catch (NumberFormatException e) { return null; }
    }

    private String hmac(String data) {
        try {
            byte[] keyBytes = getEffectiveSecret().getBytes(StandardCharsets.UTF_8);
            Mac mac = Mac.getInstance(HMAC_ALGO);
            mac.init(new SecretKeySpec(keyBytes, HMAC_ALGO));
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("HMAC computation failed", e);
        }
    }
}
