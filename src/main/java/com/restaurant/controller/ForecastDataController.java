package com.restaurant.controller;

import com.restaurant.dto.ForecastOrderRow;
import com.restaurant.dto.ForecastTariffBookingActivityRow;
import com.restaurant.dto.ForecastTariffBookingRow;
import com.restaurant.dto.ForecastTariffRevenueRow;
import com.restaurant.service.ForecastDataService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * Read-only, tenant-scoped API for forecast training data.
 * Requires auth; tenant is taken from the current user (RLS + TenantContext).
 */
@Tag(name = "Forecast Data", description = "Export training data for forecasting (tenant-scoped)")
@RestController
@RequestMapping("/api/forecast-data")
@RequiredArgsConstructor
public class ForecastDataController {

    private final ForecastDataService forecastDataService;

    @Operation(summary = "Get daily order aggregates for the current tenant")
    @GetMapping("/orders")
    public ResponseEntity<List<ForecastOrderRow>> getOrders(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(forecastDataService.getOrdersData(from, to));
    }

    @Operation(summary = "Get daily PAID tariff booking counts for the current tenant")
    @GetMapping("/tariff-bookings")
    public ResponseEntity<List<ForecastTariffBookingRow>> getTariffBookings(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(forecastDataService.getTariffBookingsData(from, to));
    }

    @Operation(summary = "Get daily PAID tariff booking revenue for the current tenant")
    @GetMapping("/tariff-revenue")
    public ResponseEntity<List<ForecastTariffRevenueRow>> getTariffRevenue(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(forecastDataService.getTariffRevenueData(from, to));
    }

    @Operation(summary = "Get daily PAID tariff bookings per activity for the current tenant")
    @GetMapping("/tariff-bookings-by-activity")
    public ResponseEntity<List<ForecastTariffBookingActivityRow>> getTariffBookingsByActivity(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(forecastDataService.getTariffBookingsByActivityData(from, to));
    }
}
