package com.restaurant.controller;

import com.restaurant.config.TimeOverrideAllowedCondition;
import com.restaurant.util.TimeUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Conditional;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * Dev/test-only: подтверждение параметров подмены времени. Реальное «виртуальное» время на бэкенде задаётся
 * только через {@code X-Time-Offset-Ms} на каждый запрос (см. {@link com.restaurant.config.TimeOverrideFilter}).
 */
@Slf4j
@RestController
@RequestMapping("/api/time-override")
@Conditional(TimeOverrideAllowedCondition.class)
@PreAuthorize("hasRole('HEAD_ADMIN')")
public class TimeOverrideController {

    @GetMapping
    public ResponseEntity<Map<String, Object>> getStatus() {
        return ResponseEntity.ok(Map.of(
                "overridden", TimeUtils.isRequestOverridden(),
                "offsetMs", TimeUtils.getCurrentRequestOffsetMs(),
                "virtualNow", TimeUtils.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                "realNow", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        ));
    }

    /**
     * Подтверждает параметры подмены (клиент хранит offset и шлёт заголовок на каждый запрос).
     * Глобальное состояние на сервере не меняет.
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> setOverride(@RequestBody Map<String, Object> body) {
        long offset;
        if (body.containsKey("offsetMs")) {
            offset = ((Number) body.get("offsetMs")).longValue();
        } else if (body.containsKey("targetTime")) {
            String targetStr = (String) body.get("targetTime");
            LocalDateTime target = LocalDateTime.parse(targetStr);
            offset = java.time.Duration.between(LocalDateTime.now(), target).toMillis();
        } else {
            offset = 0;
        }

        LocalDateTime virtualNow = offset == 0
                ? LocalDateTime.now()
                : LocalDateTime.now().plusNanos(offset * 1_000_000L);
        log.info("Time override acknowledged (request-scope only): offsetMs={}, virtualNow={}", offset, virtualNow);

        return ResponseEntity.ok(Map.of(
                "overridden", offset != 0,
                "offsetMs", offset,
                "virtualNow", virtualNow.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        ));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Object>> resetOverride() {
        log.info("Time override cleared on client (no server-global state)");
        return ResponseEntity.ok(Map.of(
                "overridden", false,
                "offsetMs", 0,
                "virtualNow", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        ));
    }
}
