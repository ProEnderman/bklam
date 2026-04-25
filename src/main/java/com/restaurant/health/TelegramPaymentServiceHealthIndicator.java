package com.restaurant.health;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.actuate.health.Status;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * GET {@code {telegram.payment.service.url}/health} (Nest). Skipped when disabled or URL blank.
 */
@Component
public class TelegramPaymentServiceHealthIndicator implements HealthIndicator {

    private final RestTemplate healthRestTemplate;
    private final org.springframework.core.env.Environment environment;

    public TelegramPaymentServiceHealthIndicator(
            @Qualifier("healthCheckRestTemplate") RestTemplate healthRestTemplate,
            org.springframework.core.env.Environment environment) {
        this.healthRestTemplate = healthRestTemplate;
        this.environment = environment;
    }

    @Override
    public Health health() {
        boolean enabled = environment.getProperty("telegram.payment.service.health.enabled", Boolean.class, true);
        if (!enabled) {
            return Health.up().withDetail("telegramPayment", "checkDisabled").build();
        }
        String base = environment.getProperty("telegram.payment.service.url", "");
        if (base == null || base.isBlank()) {
            return Health.up().withDetail("telegramPayment", "notConfigured").build();
        }
        boolean optional = environment.getProperty("telegram.payment.service.health.optional", Boolean.class, true);
        String url = trimSlash(base) + "/health";
        try {
            healthRestTemplate.getForEntity(url, String.class);
            return Health.up().withDetail("telegramPayment", url).build();
        } catch (RestClientException e) {
            if (optional) {
                return Health.status(Status.UNKNOWN)
                        .withDetail("telegramPayment", url)
                        .withDetail("error", rootMessage(e))
                        .build();
            }
            return Health.down(e).withDetail("telegramPayment", url).build();
        }
    }

    private static String trimSlash(String base) {
        String b = base.trim();
        return b.endsWith("/") ? b.substring(0, b.length() - 1) : b;
    }

    private static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null) {
            t = t.getCause();
        }
        String m = t.getMessage();
        return m != null ? m : t.getClass().getSimpleName();
    }
}
