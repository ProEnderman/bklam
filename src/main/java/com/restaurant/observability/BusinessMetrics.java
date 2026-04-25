package com.restaurant.observability;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Micrometer counters/gauges for critical paths (outbox, auth, orders, loyalty, forecast).
 */
@Component
public class BusinessMetrics {

    private final MeterRegistry registry;

    private final Counter authSuccess;
    private final Counter authFailure;

    public BusinessMetrics(MeterRegistry registry,
                          @Qualifier("platformJdbcTemplate") JdbcTemplate platformJdbcTemplate) {
        this.registry = registry;
        this.authSuccess = Counter.builder("auth_success_total").register(registry);
        this.authFailure = Counter.builder("auth_failure_total").register(registry);

        Counter.builder("outbox_processed_total").register(registry);
        Counter.builder("outbox_failed_total").register(registry);
        Counter.builder("orders_created_total").register(registry);
        Counter.builder("orders_idempotent_reused_total").register(registry);
        Counter.builder("loyalty_operations_total").register(registry);
        Counter.builder("loyalty_idempotent_hits_total").register(registry);
        Counter.builder("forecast_requests_total").register(registry);
        Counter.builder("forecast_failures_total").register(registry);

        Gauge.builder("outbox_pending_count", platformJdbcTemplate, jdbc -> {
            try {
                Integer n = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM outbox_events WHERE status IN ('NEW','RETRY')",
                        Integer.class);
                return n != null ? n.doubleValue() : 0d;
            } catch (Exception e) {
                return 0d;
            }
        }).register(registry);
    }

    public void incrementOutboxProcessed() {
        registry.counter("outbox_processed_total").increment();
    }

    public void incrementOutboxFailed() {
        registry.counter("outbox_failed_total").increment();
    }

    public void incrementSchedulerRun(String job) {
        registry.counter("scheduler_runs_total", Tags.of("job", job)).increment();
    }

    public void incrementSchedulerFailure(String job) {
        registry.counter("scheduler_failures_total", Tags.of("job", job)).increment();
    }

    public void incrementAuthSuccess() {
        authSuccess.increment();
    }

    public void incrementAuthFailure() {
        authFailure.increment();
    }

    public void incrementOrdersCreated() {
        registry.counter("orders_created_total").increment();
    }

    public void incrementOrdersIdempotentReused() {
        registry.counter("orders_idempotent_reused_total").increment();
    }

    public void incrementLoyaltyOperation(String type) {
        registry.counter("loyalty_operations_total", Tags.of("type", type)).increment();
    }

    public void incrementLoyaltyIdempotentHit() {
        registry.counter("loyalty_idempotent_hits_total").increment();
    }

    public void incrementForecastRequest() {
        registry.counter("forecast_requests_total").increment();
    }

    public void incrementForecastFailure() {
        registry.counter("forecast_failures_total").increment();
    }
}
