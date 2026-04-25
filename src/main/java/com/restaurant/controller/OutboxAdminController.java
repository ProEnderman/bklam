package com.restaurant.controller;

import com.restaurant.model.OutboxEvent;
import com.restaurant.repository.OutboxEventRepository;
import com.restaurant.security.SecurityUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Tag(name = "Outbox Admin", description = "Outbox event replay and listing (HEAD_ADMIN)")
@RestController
@RequestMapping("/api/platform/outbox")
@RequiredArgsConstructor
public class OutboxAdminController {

    private final OutboxEventRepository outboxEventRepository;

    @Operation(summary = "List outbox events by status (e.g. DEAD, PROCESSING)")
    @GetMapping
    public ResponseEntity<List<OutboxEvent>> list(
            @RequestParam(defaultValue = "DEAD") String status,
            @RequestParam(defaultValue = "20") int size) {
        if (!SecurityUtils.isHeadAdmin()) {
            return ResponseEntity.status(403).build();
        }
        List<OutboxEvent> events = outboxEventRepository.findByStatusOrderByCreatedAtDesc(
                status, PageRequest.of(0, Math.min(size, 100)));
        return ResponseEntity.ok(events);
    }

    @Operation(summary = "Replay a single outbox event (reset to NEW)")
    @PostMapping("/{id}/replay")
    public ResponseEntity<OutboxEvent> replay(@PathVariable UUID id) {
        if (!SecurityUtils.isHeadAdmin()) {
            return ResponseEntity.status(403).build();
        }
        OutboxEvent event = outboxEventRepository.findById(id).orElse(null);
        if (event == null) {
            return ResponseEntity.notFound().build();
        }
        event.setStatus(OutboxEvent.STATUS_NEW);
        event.setNextAttemptAt(Instant.now());
        event.setAttempts(0);
        event.setLastError(null);
        event.setClaimedBy(null);
        event.setClaimedAt(null);
        outboxEventRepository.save(event);
        return ResponseEntity.ok(event);
    }

    @Operation(summary = "Get outbox event counts by status")
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Long>> stats() {
        if (!SecurityUtils.isHeadAdmin()) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(Map.of(
                "NEW", outboxEventRepository.countByStatus(OutboxEvent.STATUS_NEW),
                "PROCESSING", outboxEventRepository.countByStatus(OutboxEvent.STATUS_PROCESSING),
                "RETRY", outboxEventRepository.countByStatus(OutboxEvent.STATUS_RETRY),
                "DONE", outboxEventRepository.countByStatus(OutboxEvent.STATUS_DONE),
                "DEAD", outboxEventRepository.countByStatus(OutboxEvent.STATUS_DEAD)
        ));
    }
}
