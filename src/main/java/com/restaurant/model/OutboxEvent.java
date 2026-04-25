package com.restaurant.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "outbox_events")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OutboxEvent {

    @Id
    private UUID id;

    @Column(name = "aggregate_type", nullable = false)
    private String aggregateType;

    @Column(name = "aggregate_id", nullable = false)
    private Long aggregateId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "payload", nullable = false, columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String payload;

    @Column(name = "status", nullable = false)
    private String status = "NEW";

    @Column(name = "attempts", nullable = false)
    private int attempts = 0;

    @Column(name = "next_attempt_at", nullable = false)
    private java.time.Instant nextAttemptAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private java.time.Instant createdAt;

    @Column(name = "last_error")
    private String lastError;

    @Column(name = "claimed_by")
    private String claimedBy;

    @Column(name = "claimed_at")
    private Instant claimedAt;

    @PrePersist
    protected void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = java.time.Instant.now();
        }
        if (nextAttemptAt == null) {
            nextAttemptAt = java.time.Instant.now();
        }
    }

    public static final String STATUS_NEW = "NEW";
    public static final String STATUS_PROCESSING = "PROCESSING";
    public static final String STATUS_RETRY = "RETRY";
    public static final String STATUS_DONE = "DONE";
    public static final String STATUS_DEAD = "DEAD";
    public static final String EVENT_ORDER_CLOSED = "ORDER_CLOSED";
    public static final String AGGREGATE_ORDER = "ORDER";
}
