package com.restaurant.controller;

import com.restaurant.service.BookingAnalyticsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@Tag(name = "Booking Analytics", description = "Comprehensive booking analytics & BI")
@RestController
@RequestMapping("/api/booking-analytics")
@RequiredArgsConstructor
public class BookingAnalyticsController {

    private final BookingAnalyticsService analyticsService;

    @Operation(summary = "Full dashboard (all sections)")
    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getFullDashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long restaurantId
    ) {
        return ResponseEntity.ok(analyticsService.getFullDashboard(from, to, restaurantId));
    }

    @Operation(summary = "Booking volume analytics")
    @GetMapping("/volume")
    public ResponseEntity<Map<String, Object>> getVolume(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long restaurantId
    ) {
        return ResponseEntity.ok(analyticsService.getVolumeAnalytics(from, to, restaurantId));
    }

    @Operation(summary = "Revenue analytics")
    @GetMapping("/revenue")
    public ResponseEntity<Map<String, Object>> getRevenue(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long restaurantId
    ) {
        return ResponseEntity.ok(analyticsService.getRevenueAnalytics(from, to, restaurantId));
    }

    @Operation(summary = "Conversion & client behavior")
    @GetMapping("/conversion")
    public ResponseEntity<Map<String, Object>> getConversion(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long restaurantId
    ) {
        return ResponseEntity.ok(analyticsService.getConversionAnalytics(from, to, restaurantId));
    }

    @Operation(summary = "Capacity & utilization")
    @GetMapping("/capacity")
    public ResponseEntity<Map<String, Object>> getCapacity(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long restaurantId
    ) {
        return ResponseEntity.ok(analyticsService.getCapacityAnalytics(from, to, restaurantId));
    }

    @Operation(summary = "Stop-check analytics")
    @GetMapping("/stop-check")
    public ResponseEntity<Map<String, Object>> getStopCheck(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long restaurantId
    ) {
        return ResponseEntity.ok(analyticsService.getStopCheckAnalytics(from, to, restaurantId));
    }

    @Operation(summary = "Tariff & pricing analytics")
    @GetMapping("/tariffs")
    public ResponseEntity<Map<String, Object>> getTariffs(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long restaurantId
    ) {
        return ResponseEntity.ok(analyticsService.getTariffAnalytics(from, to, restaurantId));
    }

    @Operation(summary = "Notification analytics")
    @GetMapping("/notifications")
    public ResponseEntity<Map<String, Object>> getNotifications(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long restaurantId
    ) {
        return ResponseEntity.ok(analyticsService.getNotificationAnalytics(from, to, restaurantId));
    }
}
