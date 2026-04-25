package com.restaurant.health;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.actuate.health.Status;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * GET {@code {forecast.service.url}/health} (FastAPI). Skipped when disabled or URL blank.
 */
@Component
public class ForecastServiceHealthIndicator implements HealthIndicator {

    private final RestTemplate healthRestTemplate;
    private final org.springframework.core.env.Environment environment;

    public ForecastServiceHealthIndicator(
            @Qualifier("healthCheckRestTemplate") RestTemplate healthRestTemplate,
            org.springframework.core.env.Environment environment) {
        this.healthRestTemplate = healthRestTemplate;
        this.environment = environment;
    }

    @Override
    public Health health() {
        boolean enabled = environment.getProperty("forecast.service.health.enabled", Boolean.class, true);
        if (!enabled) {
            return Health.up().withDetail("forecast", "checkDisabled").build();
        }
        String base = environment.getProperty("forecast.service.url", "");
        if (base == null || base.isBlank()) {
            return Health.up().withDetail("forecast", "notConfigured").build();
        }
        boolean optional = environment.getProperty("forecast.service.health.optional", Boolean.class, true);
        String url = trimSlash(base) + "/health";
        try {
            healthRestTemplate.getForEntity(url, String.class);
            return Health.up().withDetail("forecast", url).build();
        } catch (RestClientException e) {
            if (optional) {
                return Health.status(Status.UNKNOWN)
                        .withDetail("forecast", url)
                        .withDetail("error", rootMessage(e))
                        .build();
            }
            return Health.down(e).withDetail("forecast", url).build();
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
