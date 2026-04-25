package com.restaurant.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.restaurant.model.LoyaltyOrderAccrual;
import com.restaurant.model.OutboxEvent;
import com.restaurant.repository.LoyaltyOrderAccrualRepository;
import com.restaurant.observability.BusinessMetrics;
import com.restaurant.tenant.TenantContext;
import com.restaurant.service.loyalty.CampaignEngine;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import org.springframework.jdbc.BadSqlGrammarException;

import java.math.BigDecimal;
import java.net.InetAddress;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Processes outbox_events (e.g. ORDER_CLOSED for loyalty). Runs every 10 seconds on scheduler thread.
 * Uses platform DS to fetch due events across tenants; sets TenantContext per event for processing.
 * SQL touches only {@code outbox_events} (global queue) by id/status; tenant work uses tenant repos after {@code TenantContext.set}.
 *
 * Multi-instance safe: uses SELECT ... FOR UPDATE SKIP LOCKED to claim events atomically.
 * Only the instance that claims an event will process it; others skip locked rows.
 * {@code @SchedulerLock} reduces redundant polling across instances (row claims remain authoritative).
 */
@Slf4j
@Service
public class OutboxDispatcherService {

    private static final int MAX_ATTEMPTS = 5;
    private static final Duration INITIAL_BACKOFF = Duration.ofSeconds(10);
    private static final int PAGE_SIZE = 20;
    private static final Duration STUCK_THRESHOLD = Duration.ofMinutes(5);

    private final JdbcTemplate platformJdbcTemplate;
    private final LoyaltyOrderAccrualRepository loyaltyOrderAccrualRepository;
    private final CampaignEngine campaignEngine;
    private final TransactionTemplate transactionTemplate;
    private final BusinessMetrics businessMetrics;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String workerId;

    private static final String CLAIM_SQL =
            "WITH due AS (" +
            "  SELECT id FROM outbox_events" +
            "  WHERE status IN ('NEW', 'RETRY') AND next_attempt_at <= ?" +
            "  ORDER BY next_attempt_at ASC" +
            "  LIMIT ?" +
            "  FOR UPDATE SKIP LOCKED" +
            ") " +
            "UPDATE outbox_events SET status = 'PROCESSING', claimed_by = ?, claimed_at = ?" +
            " FROM due WHERE outbox_events.id = due.id" +
            " RETURNING outbox_events.id, outbox_events.aggregate_type, outbox_events.aggregate_id," +
            "  outbox_events.event_type, outbox_events.payload, outbox_events.status," +
            "  outbox_events.attempts, outbox_events.next_attempt_at, outbox_events.created_at," +
            "  outbox_events.last_error";

    private static final String RECOVER_STUCK_SQL =
            "UPDATE outbox_events SET status = 'RETRY', claimed_by = NULL, claimed_at = NULL" +
            " WHERE status = 'PROCESSING' AND claimed_at < ?";

    public OutboxDispatcherService(
            @Qualifier("platformJdbcTemplate") JdbcTemplate platformJdbcTemplate,
            LoyaltyOrderAccrualRepository loyaltyOrderAccrualRepository,
            CampaignEngine campaignEngine,
            TransactionTemplate transactionTemplate,
            BusinessMetrics businessMetrics,
            @Value("${outbox.dispatcher.worker-id:}") String configuredWorkerId) {
        this.platformJdbcTemplate = platformJdbcTemplate;
        this.loyaltyOrderAccrualRepository = loyaltyOrderAccrualRepository;
        this.campaignEngine = campaignEngine;
        this.transactionTemplate = transactionTemplate;
        this.businessMetrics = businessMetrics;
        this.workerId = resolveWorkerId(configuredWorkerId);
        log.info("OutboxDispatcher initialized: workerId={}", this.workerId);
    }

    private static String resolveWorkerId(String configured) {
        if (configured != null && !configured.isBlank()) {
            return configured;
        }
        try {
            return InetAddress.getLocalHost().getHostName() + "-" + ProcessHandle.current().pid();
        } catch (Exception e) {
            return UUID.randomUUID().toString().substring(0, 12);
        }
    }

    private static final RowMapper<OutboxEvent> OUTBOX_ROW_MAPPER = (ResultSet rs, int rowNum) -> {
        OutboxEvent e = new OutboxEvent();
        e.setId(UUID.fromString(rs.getString("id")));
        e.setAggregateType(rs.getString("aggregate_type"));
        e.setAggregateId(rs.getLong("aggregate_id"));
        e.setEventType(rs.getString("event_type"));
        e.setPayload(rs.getString("payload"));
        e.setStatus(rs.getString("status"));
        e.setAttempts(rs.getInt("attempts"));
        e.setNextAttemptAt(rs.getTimestamp("next_attempt_at").toInstant());
        e.setCreatedAt(rs.getTimestamp("created_at").toInstant());
        e.setLastError(rs.getString("last_error"));
        return e;
    };

    /**
     * Main dispatch loop. Claims due events atomically via FOR UPDATE SKIP LOCKED,
     * then processes each claimed event individually.
     */
    @Scheduled(fixedDelayString = "${outbox.dispatcher.interval-ms:10000}")
    @SchedulerLock(name = "OutboxDispatcher.processOutbox", lockAtLeastFor = "5s", lockAtMostFor = "15m")
    public void processOutbox() {
        recoverStuckProcessing();

        List<OutboxEvent> claimed;
        try {
            Timestamp now = Timestamp.from(Instant.now());
            claimed = platformJdbcTemplate.query(
                    CLAIM_SQL, OUTBOX_ROW_MAPPER,
                    now, PAGE_SIZE, workerId, now);
        } catch (BadSqlGrammarException e) {
            if (e.getCause() != null && e.getCause().getMessage() != null
                    && e.getCause().getMessage().contains("does not exist")) {
                log.trace("Skipping outbox processing: outbox_events table not present");
                return;
            }
            throw e;
        }

        if (!claimed.isEmpty()) {
            log.debug("Claimed {} outbox event(s) for processing (worker={})", claimed.size(), workerId);
        }

        for (OutboxEvent event : claimed) {
            try {
                if (OutboxEvent.EVENT_ORDER_CLOSED.equals(event.getEventType())) {
                    processOrderClosed(event);
                } else {
                    log.warn("Unknown outbox event type: {}", event.getEventType());
                    markDonePlatform(event.getId());
                }
            } catch (Exception e) {
                log.error("Outbox processing failed: id={} type={}", event.getId(), event.getEventType(), e);
                handleFailurePlatform(event, e);
            }
        }
    }

    /**
     * Recovers events stuck in PROCESSING beyond the threshold (e.g., instance crashed mid-processing).
     * Resets them to RETRY so they can be picked up by any live worker.
     */
    public void recoverStuckProcessing() {
        try {
            Instant cutoff = Instant.now().minus(STUCK_THRESHOLD);
            int recovered = platformJdbcTemplate.update(RECOVER_STUCK_SQL, Timestamp.from(cutoff));
            if (recovered > 0) {
                log.warn("Recovered {} stuck PROCESSING outbox event(s) (threshold={})", recovered, STUCK_THRESHOLD);
            }
        } catch (BadSqlGrammarException e) {
            if (e.getCause() != null && e.getCause().getMessage() != null
                    && e.getCause().getMessage().contains("does not exist")) {
                return;
            }
            throw e;
        }
    }

    /**
     * Idempotent at order scope: (1) if guard row is already
     * {@link com.restaurant.model.LoyaltyOrderAccrual#STATUS_PROCESSED},
     * skip {@link CampaignEngine} and only mark this outbox row DONE; (2) else run campaign + upsert guard in one TX.
     * Safe for duplicate outbox UUIDs and retries: second row sees PROCESSED and does not re-apply loyalty.
     */
    private void processOrderClosed(OutboxEvent event) throws Exception {
        JsonNode payload = objectMapper.readTree(event.getPayload());
        long guestIdVal = payload.path("guestId").asLong(0);
        if (guestIdVal == 0) {
            log.debug("Skipping loyalty: guestId=null orderId={}", event.getAggregateId());
            markDonePlatform(event.getId());
            return;
        }
        long restaurantId = payload.path("restaurantId").asLong(0);
        if (restaurantId == 0) {
            log.warn("Skipping loyalty: restaurantId missing for orderId={}", event.getAggregateId());
            markDonePlatform(event.getId());
            return;
        }
        String totalAmountStr = payload.path("totalAmount").asText("0");
        BigDecimal totalAmount = new BigDecimal(totalAmountStr);
        Long orderId = event.getAggregateId();

        TenantContext.set(restaurantId);
        try {
            transactionTemplate.executeWithoutResult(status -> {
                if (loyaltyOrderAccrualRepository.existsByRestaurantIdAndOrderIdAndStatus(
                        restaurantId, orderId, LoyaltyOrderAccrual.STATUS_PROCESSED)) {
                    log.debug("Order already processed: restaurantId={} orderId={}", restaurantId, orderId);
                    return;
                }
                campaignEngine.processOrderEvent(guestIdVal, orderId, totalAmount, restaurantId);
                loyaltyOrderAccrualRepository.upsertProcessed(restaurantId, orderId);
            });
            markDonePlatform(event.getId());
        } finally {
            TenantContext.clear();
        }
    }

    private void markDonePlatform(UUID eventId) {
        platformJdbcTemplate.update(
                "UPDATE outbox_events SET status = ?, claimed_by = NULL, claimed_at = NULL WHERE id = ?",
                OutboxEvent.STATUS_DONE, eventId);
        businessMetrics.incrementOutboxProcessed();
    }

    private void handleFailurePlatform(OutboxEvent event, Exception e) {
        int attempts = event.getAttempts() + 1;
        String status = attempts >= MAX_ATTEMPTS ? OutboxEvent.STATUS_DEAD : OutboxEvent.STATUS_RETRY;
        Instant nextAttempt = attempts >= MAX_ATTEMPTS ? event.getNextAttemptAt()
                : Instant.now().plus(INITIAL_BACKOFF.multipliedBy(1L << attempts));
        String lastError = e.getMessage();
        if (lastError != null && lastError.length() > 500) {
            lastError = lastError.substring(0, 500);
        }
        platformJdbcTemplate.update(
                "UPDATE outbox_events SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?," +
                        " claimed_by = NULL, claimed_at = NULL WHERE id = ?",
                status, attempts, Timestamp.from(nextAttempt), lastError, event.getId());
        businessMetrics.incrementOutboxFailed();
    }

    String getWorkerId() {
        return workerId;
    }
}
