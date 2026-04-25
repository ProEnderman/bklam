package com.restaurant.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

@Component
public class TelegramWebAppAuthUtil {

    private final ObjectMapper objectMapper;
    private final String botToken;
    private final long maxAuthAgeSeconds;

    public TelegramWebAppAuthUtil(
            ObjectMapper objectMapper,
            @Value("${telegram.bot.token:}") String botToken,
            @Value("${telegram.webapp.max-auth-age-seconds:86400}") long maxAuthAgeSeconds
    ) {
        this.objectMapper = objectMapper;
        this.botToken = botToken;
        this.maxAuthAgeSeconds = maxAuthAgeSeconds;
    }

    public Optional<Long> validateAndExtractUserId(String initDataRaw) {
        return validateAndExtractUserId(initDataRaw, botToken);
    }

    public Optional<Long> validateAndExtractUserId(String initDataRaw, String botTokenOverride) {
        if (initDataRaw == null || initDataRaw.isBlank()) return Optional.empty();
        if (botTokenOverride == null || botTokenOverride.isBlank()) return Optional.empty();

        Map<String, String> params = parse(initDataRaw);
        String hash = params.remove("hash");
        if (hash == null || hash.isBlank()) return Optional.empty();

        String dataCheckString = buildDataCheckString(params);
        String computed = hmacHex(secretKey(botTokenOverride), dataCheckString);
        if (!constantTimeEquals(hash, computed)) return Optional.empty();

        String authDateRaw = params.get("auth_date");
        if (authDateRaw != null) {
            try {
                long authDate = Long.parseLong(authDateRaw);
                long now = Instant.now().getEpochSecond();
                if (maxAuthAgeSeconds > 0 && now - authDate > maxAuthAgeSeconds) {
                    return Optional.empty();
                }
            } catch (NumberFormatException ignored) {
                return Optional.empty();
            }
        }

        String userRaw = params.get("user");
        if (userRaw == null || userRaw.isBlank()) return Optional.empty();
        try {
            JsonNode node = objectMapper.readTree(userRaw);
            if (!node.has("id")) return Optional.empty();
            return Optional.of(node.get("id").asLong());
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    public Optional<Long> extractUserIdUnsafe(String initDataRaw) {
        if (initDataRaw == null || initDataRaw.isBlank()) return Optional.empty();
        Map<String, String> params = parse(initDataRaw);
        String userRaw = params.get("user");
        if (userRaw == null || userRaw.isBlank()) return Optional.empty();
        try {
            JsonNode node = objectMapper.readTree(userRaw);
            if (!node.has("id")) return Optional.empty();
            return Optional.of(node.get("id").asLong());
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    public Optional<Long> extractRestaurantIdHint(String initDataRaw) {
        if (initDataRaw == null || initDataRaw.isBlank()) return Optional.empty();
        Map<String, String> params = parse(initDataRaw);
        String startParam = params.get("start_param");
        if (startParam == null || startParam.isBlank()) return Optional.empty();
        return parseRestaurantIdFromStartParam(startParam);
    }

    private Optional<Long> parseRestaurantIdFromStartParam(String startParam) {
        try {
            long plain = Long.parseLong(startParam);
            return plain > 0 ? Optional.of(plain) : Optional.empty();
        } catch (NumberFormatException ignored) {
            // not a plain number; try known patterns
        }

        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(?:restaurantId=|r_)(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(startParam);
        if (!m.find()) return Optional.empty();

        try {
            long id = Long.parseLong(m.group(1));
            return id > 0 ? Optional.of(id) : Optional.empty();
        } catch (NumberFormatException ignored) {
            return Optional.empty();
        }
    }

    private Map<String, String> parse(String qs) {
        Map<String, String> map = new LinkedHashMap<>();
        String[] pairs = qs.split("&");
        for (String p : pairs) {
            if (p.isBlank()) continue;
            int idx = p.indexOf('=');
            if (idx <= 0) continue;
            String k = URLDecoder.decode(p.substring(0, idx), StandardCharsets.UTF_8);
            String v = URLDecoder.decode(p.substring(idx + 1), StandardCharsets.UTF_8);
            map.put(k, v);
        }
        return map;
    }

    private String buildDataCheckString(Map<String, String> params) {
        return params.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> e.getKey() + "=" + e.getValue())
                .reduce((a, b) -> a + "\n" + b)
                .orElse("");
    }

    private byte[] secretKey(String token) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec("WebAppData".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(token.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to build Telegram secret key", e);
        }
    }

    private String hmacHex(byte[] key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] out = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(out.length * 2);
            for (byte b : out) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to compute Telegram hash", e);
        }
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        byte[] aa = a.getBytes(StandardCharsets.UTF_8);
        byte[] bb = b.getBytes(StandardCharsets.UTF_8);
        return java.security.MessageDigest.isEqual(aa, bb);
    }
}

