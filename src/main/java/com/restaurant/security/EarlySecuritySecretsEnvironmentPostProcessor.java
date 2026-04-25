package com.restaurant.security;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;

import java.util.Arrays;
import java.util.Base64;
import java.util.Locale;
import java.util.Set;

/**
 * Runs after config files are loaded but before ApplicationContext refresh,
 * so invalid security secrets fail startup before Flyway / Tomcat initialization.
 *
 * Order must be AFTER ConfigDataEnvironmentPostProcessor (HIGHEST_PRECEDENCE + 10)
 * so that application.yml and profile-specific properties (e.g. application-test.yml)
 * are already available in the Environment when we validate.
 */
public class EarlySecuritySecretsEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    private static final int ORDER = Ordered.HIGHEST_PRECEDENCE + 11;
    /** Profiles treated like dev for strict-vs-placeholder rules (local-docker = Compose on laptop). */
    private static final Set<String> DEV_PROFILES = Set.of("dev", "test", "local", "local-docker", "default");

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String jwtSecret = trim(getFirst(environment, "jwt.secret", "JWT_SECRET"));
        String forecastSecretB64 = trim(getFirst(environment, "forecast.internal_jwt.secret", "FORECAST_INTERNAL_JWT_SECRET_B64"));
        String qrSigningSecret = trim(getFirst(environment, "qr.signing.secret", "QR_SIGNING_SECRET"));
        boolean allowInsecureDevSecrets = Boolean.parseBoolean(
                trim(getFirst(environment, "security.allow-insecure-dev-secrets", "ALLOW_INSECURE_DEV_SECRETS", "false"))
        );

        boolean strict = isNonDevProfile(environment) || !allowInsecureDevSecrets;

        requirePresent("jwt.secret", jwtSecret);
        requirePresent("forecast.internal_jwt.secret", forecastSecretB64);
        requirePresent("qr.signing.secret", qrSigningSecret);

        requireMinLength("jwt.secret", jwtSecret, 32);
        requireMinLength("qr.signing.secret", qrSigningSecret, 32);
        requireBase64MinBytes("forecast.internal_jwt.secret", forecastSecretB64, 32);

        if (strict) {
            requireNoPlaceholder("jwt.secret", jwtSecret);
            requireNoPlaceholder("qr.signing.secret", qrSigningSecret);
            requireNoPlaceholder("forecast.internal_jwt.secret", forecastSecretB64);
        }

        boolean telegramWebhookEnabled = Boolean.parseBoolean(
                trim(getFirst(environment, "telegram.webhook.enabled", "TELEGRAM_WEBHOOK_ENABLED", "false")));
        String telegramWebhookSecret = trim(getFirst(environment, "telegram.webhook.secret", "TELEGRAM_WEBHOOK_SECRET"));
        if (telegramWebhookEnabled) {
            requirePresent("telegram.webhook.secret", telegramWebhookSecret);
            requireMinLength("telegram.webhook.secret", telegramWebhookSecret, 16);
            if (strict) {
                requireNoPlaceholder("telegram.webhook.secret", telegramWebhookSecret);
            }
        }
    }

    @Override
    public int getOrder() {
        return ORDER;
    }

    private static boolean isNonDevProfile(ConfigurableEnvironment environment) {
        String[] activeProfiles = environment.getActiveProfiles();
        if (activeProfiles.length == 0) {
            return false;
        }
        return Arrays.stream(activeProfiles)
                .map(p -> p == null ? "" : p.toLowerCase(Locale.ROOT))
                .noneMatch(DEV_PROFILES::contains);
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static String getFirst(ConfigurableEnvironment environment, String... keys) {
        for (String key : keys) {
            String value = environment.getProperty(key);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static void requirePresent(String key, String value) {
        if (value.isBlank()) {
            throw new IllegalStateException("Security secret validation failed: '" + key + "' is missing or empty");
        }
    }

    private static void requireMinLength(String key, String value, int minLen) {
        if (value.length() < minLen) {
            throw new IllegalStateException("Security secret validation failed: '" + key + "' must be at least " + minLen + " characters");
        }
    }

    private static void requireNoPlaceholder(String key, String value) {
        String v = value.toLowerCase(Locale.ROOT);
        if (v.contains("change-me")
                || v.contains("default-secret")
                || v.contains("test-secret")
                || v.contains("your-secret")
                || v.contains("dev-jwt-secret")
                || v.contains("qr-menu-dev-secret")) {
            throw new IllegalStateException("Security secret validation failed: '" + key + "' contains insecure placeholder value");
        }
    }

    private static void requireBase64MinBytes(String key, String value, int minBytes) {
        try {
            byte[] decoded = Base64.getDecoder().decode(value);
            if (decoded.length < minBytes) {
                throw new IllegalStateException("Security secret validation failed: '" + key + "' must decode to at least " + minBytes + " bytes");
            }
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Security secret validation failed: '" + key + "' must be valid base64", e);
        }
    }
}
