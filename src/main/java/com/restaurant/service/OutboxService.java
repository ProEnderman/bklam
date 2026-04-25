package com.restaurant.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.restaurant.model.OutboxEvent;
import com.restaurant.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

/**
 * Appends domain events to the outbox in the same transaction as the producing operation.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OutboxService {

    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Transactional(rollbackFor = Exception.class)
    public void appendOrderClosed(Long orderId, Long restaurantId, BigDecimal totalAmount, Long guestId) {
        Map<String, Object> payload = Map.of(
                "orderId", orderId,
                "restaurantId", restaurantId != null ? restaurantId : 0,
                "totalAmount", totalAmount != null ? totalAmount.toPlainString() : "0",
                "guestId", guestId != null ? guestId : 0
        );
        try {
            String payloadJson = objectMapper.writeValueAsString(payload);
            OutboxEvent event = new OutboxEvent();
            event.setAggregateType(OutboxEvent.AGGREGATE_ORDER);
            event.setAggregateId(orderId);
            event.setEventType(OutboxEvent.EVENT_ORDER_CLOSED);
            event.setPayload(payloadJson);
            event.setStatus(OutboxEvent.STATUS_NEW);
            event.setNextAttemptAt(Instant.now());
            event.setCreatedAt(Instant.now());
            outboxEventRepository.save(event);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize outbox payload", e);
        }
    }
}
