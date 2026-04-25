package com.restaurant.controller;

import com.restaurant.dto.BookingNotificationDto;
import com.restaurant.dto.ResolveNotificationRequest;
import com.restaurant.service.BookingNotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/booking-notifications")
@RequiredArgsConstructor
public class BookingNotificationController {

    private final BookingNotificationService notificationService;

    /**
     * GET /api/booking-notifications/pending — все необработанные уведомления
     */
    @GetMapping("/pending")
    public ResponseEntity<List<BookingNotificationDto>> getPending() {
        return ResponseEntity.ok(notificationService.getPending());
    }

    /**
     * GET /api/booking-notifications — все уведомления (PENDING + RESOLVED)
     */
    @GetMapping
    public ResponseEntity<List<BookingNotificationDto>> getAll() {
        return ResponseEntity.ok(notificationService.getAll());
    }

    /**
     * GET /api/booking-notifications/count — количество PENDING
     */
    @GetMapping("/count")
    public ResponseEntity<Map<String, Long>> countPending() {
        return ResponseEntity.ok(Map.of("count", notificationService.countPending()));
    }

    /**
     * POST /api/booking-notifications/{id}/resolve — обработать уведомление
     * Body: { "response": "CONFIRMED" | "CANCELLED" | "CONTINUES" | "PAID_OR_CANCELLED", "newEndAt": "2026-02-08T15:00" }
     */
    @PostMapping("/{id}/resolve")
    public ResponseEntity<BookingNotificationDto> resolve(
        @PathVariable Long id,
        @RequestBody @Valid ResolveNotificationRequest request
    ) {
        return ResponseEntity.ok(notificationService.resolve(id, request));
    }

    /**
     * POST /api/booking-notifications/check-now — немедленно проверить просроченные и напоминания.
     * Используется при подмене виртуального времени для мгновенного создания уведомлений.
     */
    @PostMapping("/check-now")
    public ResponseEntity<Map<String, Object>> checkNow() {
        int autoResolved = notificationService.autoResolveNotificationsNow();
        int reminders = notificationService.createReminderNotificationsNow();
        int overdue = notificationService.createOverdueNotificationsNow();
        return ResponseEntity.ok(Map.of(
            "remindersCreated", reminders,
            "overdueCreated", overdue,
            "autoResolved", autoResolved,
            "virtualNow", com.restaurant.util.TimeUtils.now().toString()
        ));
    }
}
