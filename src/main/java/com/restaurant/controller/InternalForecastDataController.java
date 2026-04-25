package com.restaurant.controller;

import com.restaurant.dto.ForecastOrderRow;
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
 * Internal forecast data API. Protected by InternalForecastAuthFilter (internal JWT with tenant_id).
 * Not exposed to public; used by FastAPI forecasting service.
 */
@Tag(name = "Internal Forecast Data", description = "Tenant-scoped data for forecast service (internal JWT only)")
@RestController
@RequestMapping("/api/internal/forecast-data")
@RequiredArgsConstructor
public class InternalForecastDataController {

    private final ForecastDataService forecastDataService;

    @Operation(summary = "Get daily order aggregates for tenant from JWT")
    @GetMapping("/orders")
    public ResponseEntity<List<ForecastOrderRow>> getOrders(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(forecastDataService.getOrdersData(from, to));
    }
}
