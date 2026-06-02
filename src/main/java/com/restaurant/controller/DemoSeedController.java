package com.restaurant.controller;

import com.restaurant.dto.DemoBookingTariffSeedResult;
import com.restaurant.dto.DemoOrderSeedResult;
import com.restaurant.service.DemoBookingTariffSeedService;
import com.restaurant.service.DemoOrderSeedService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@Tag(name = "Demo seed", description = "Local/staging demo data generators (disabled by default)")
@RestController
@RequestMapping("/api/demo")
@RequiredArgsConstructor
public class DemoSeedController {

    private final DemoOrderSeedService demoOrderSeedService;
    private final DemoBookingTariffSeedService demoBookingTariffSeedService;

    @Operation(summary = "Generate realistic demo orders (requires demo.order-seed.enabled)")
    @PostMapping("/seed-orders")
    public ResponseEntity<DemoOrderSeedResult> seedOrders(
        @RequestParam(defaultValue = "500") int count,
        @RequestParam(defaultValue = "180") int daysBack
    ) {
        return ResponseEntity.ok(demoOrderSeedService.seedOrders(count, daysBack));
    }

    @Operation(summary = "Generate demo tariff activities and bookings (requires demo.booking-seed.enabled)")
    @PostMapping("/seed-tariff-bookings")
    public ResponseEntity<DemoBookingTariffSeedResult> seedTariffBookings(
        @RequestParam(defaultValue = "5000") int count,
        @RequestParam(defaultValue = "180") int daysBack,
        @RequestParam(defaultValue = "false") boolean reset
    ) {
        return ResponseEntity.ok(demoBookingTariffSeedService.seedTariffBookings(count, daysBack, reset));
    }

    @Operation(summary = "Add repeat-client bookings for cohort retention (same phone across weeks)")
    @PostMapping("/seed-cohort-retention")
    public ResponseEntity<DemoBookingTariffSeedResult> seedCohortRetention(
        @RequestParam(defaultValue = "400") int targetBookings,
        @RequestParam(defaultValue = "180") int daysBack,
        @RequestParam(defaultValue = "0") int startClientSeq
    ) {
        return ResponseEntity.ok(
            demoBookingTariffSeedService.seedCohortRetention(targetBookings, daysBack, startClientSeq));
    }

    @Operation(summary = "Seed bookings + optional menu orders for full analytics demo")
    @PostMapping("/seed-full-analytics-demo")
    public ResponseEntity<Map<String, Object>> seedFullAnalyticsDemo(
        @RequestParam(defaultValue = "5000") int bookingCount,
        @RequestParam(defaultValue = "5000") int orderCount,
        @RequestParam(defaultValue = "180") int daysBack,
        @RequestParam(defaultValue = "false") boolean reset,
        @RequestParam(defaultValue = "true") boolean seedMenuOrders
    ) {
        DemoBookingTariffSeedResult bookings = demoBookingTariffSeedService.seedTariffBookings(bookingCount, daysBack, reset);
        DemoOrderSeedResult orders = null;
        if (seedMenuOrders) {
            orders = demoOrderSeedService.seedOrders(orderCount, daysBack);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("bookings", bookings);
        body.put("orders", orders);
        return ResponseEntity.ok(body);
    }
}
