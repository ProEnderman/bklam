package com.restaurant.controller;

import com.restaurant.service.AnalyticsService;
import com.restaurant.service.RestaurantDataExportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Tag(name = "Analytics", description = "Business intelligence and analytics")
@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
public class AnalyticsController {
    
    private final AnalyticsService analyticsService;
    private final RestaurantDataExportService restaurantDataExportService;
    
    @Operation(summary = "Get overview analytics")
    @GetMapping("/overview")
    public ResponseEntity<Map<String, Object>> getOverview(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long restaurantId
    ) {
        Map<String, Object> overview = analyticsService.getOverview(from, to, restaurantId);
        return ResponseEntity.ok(overview);
    }
    
    @Operation(summary = "Get revenue analytics")
    @GetMapping("/revenue")
    public ResponseEntity<com.restaurant.dto.RevenueDto> getRevenue(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long restaurantId
    ) {
        Map<String, Object> revenueMap = analyticsService.getRevenue(from, to, restaurantId);
        java.math.BigDecimal total = (java.math.BigDecimal) revenueMap.get("total");
        String period = (String) revenueMap.getOrDefault("period", "All time");
        @SuppressWarnings("unchecked")
        Map<String, java.math.BigDecimal> byDay =
            (Map<String, java.math.BigDecimal>) revenueMap.getOrDefault("byDay", Map.of());
        @SuppressWarnings("unchecked")
        Map<String, java.math.BigDecimal> byWeek =
            (Map<String, java.math.BigDecimal>) revenueMap.getOrDefault("byWeek", Map.of());
        @SuppressWarnings("unchecked")
        Map<String, java.math.BigDecimal> byMonth =
            (Map<String, java.math.BigDecimal>) revenueMap.getOrDefault("byMonth", Map.of());
        @SuppressWarnings("unchecked")
        Map<String, java.math.BigDecimal> byYear =
            (Map<String, java.math.BigDecimal>) revenueMap.getOrDefault("byYear", Map.of());
        com.restaurant.dto.RevenueDto revenue = new com.restaurant.dto.RevenueDto(
            total != null ? total : java.math.BigDecimal.ZERO,
            period,
            byDay,
            byWeek,
            byMonth,
            byYear
        );
        return ResponseEntity.ok(revenue);
    }
    
    @Operation(summary = "Get employee analytics")
    @GetMapping("/employees")
    public ResponseEntity<Map<String, Object>> getEmployeeAnalytics(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long restaurantId
    ) {
        Map<String, Object> analytics = analyticsService.getEmployeeAnalytics(from, to, restaurantId);
        return ResponseEntity.ok(analytics);
    }
    
    @Operation(summary = "Get pricing rules impact")
    @GetMapping("/pricing-rules")
    public ResponseEntity<Map<String, Object>> getPricingRulesImpact(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long restaurantId
    ) {
        Map<String, Object> impact = analyticsService.getPricingRulesImpact(from, to, restaurantId);
        return ResponseEntity.ok(impact);
    }
    
    @Operation(summary = "Get stop-check analytics")
    @GetMapping("/stop-checks")
    public ResponseEntity<Map<String, Object>> getStopCheckAnalytics(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long restaurantId
    ) {
        Map<String, Object> analytics = analyticsService.getStopCheckAnalytics(from, to, restaurantId);
        return ResponseEntity.ok(analytics);
    }
    
    @Operation(summary = "Get top dishes")
    @GetMapping("/top-dishes")
    public ResponseEntity<List<com.restaurant.dto.TopDishDto>> getTopDishes(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromDateTime,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toDateTime,
        @RequestParam(defaultValue = "10") int limit,
        @RequestParam(required = false) Long restaurantId
    ) {
        // Поддержка как LocalDate, так и LocalDateTime для обратной совместимости
        LocalDate fromDate = from != null ? from : (fromDateTime != null ? fromDateTime.toLocalDate() : null);
        LocalDate toDate = to != null ? to : (toDateTime != null ? toDateTime.toLocalDate() : null);
        
        List<com.restaurant.dto.TopDishDto> topDishes = analyticsService.getTopDishes(fromDate, toDate, limit, restaurantId);
        return ResponseEntity.ok(topDishes);
    }
    
    @Operation(summary = "Get problem ingredients")
    @GetMapping("/problem-ingredients")
    public ResponseEntity<List<com.restaurant.dto.ProblemIngredientDto>> getProblemIngredients(
        @RequestParam(required = false) Long restaurantId
    ) {
        List<com.restaurant.dto.ProblemIngredientDto> problems = analyticsService.getProblemIngredients(restaurantId);
        return ResponseEntity.ok(problems);
    }
    
    @Operation(summary = "Get ingredient usage")
    @GetMapping("/ingredient-usage")
    public ResponseEntity<List<com.restaurant.dto.IngredientUsageDto>> getIngredientUsage(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromDateTime,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toDateTime,
        @RequestParam(required = false) Long restaurantId
    ) {
        // Поддержка как LocalDate, так и LocalDateTime для обратной совместимости
        LocalDate fromDate = from != null ? from : (fromDateTime != null ? fromDateTime.toLocalDate() : null);
        LocalDate toDate = to != null ? to : (toDateTime != null ? toDateTime.toLocalDate() : null);
        
        List<com.restaurant.dto.IngredientUsageDto> usage = analyticsService.getIngredientUsage(fromDate, toDate, restaurantId);
        return ResponseEntity.ok(usage);
    }
    
    @Operation(summary = "Get product sales analytics")
    @GetMapping("/product-sales")
    public ResponseEntity<Map<String, Object>> getProductSalesAnalytics(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long restaurantId
    ) {
        Map<String, Object> analytics = analyticsService.getProductSalesAnalytics(from, to, restaurantId);
        return ResponseEntity.ok(analytics);
    }

    @Operation(summary = "Paid bookings: visits by tariff plan and rule type per day")
    @GetMapping("/booking-tariff-visits")
    public ResponseEntity<Map<String, Object>> getBookingTariffVisitAnalytics(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long restaurantId
    ) {
        return ResponseEntity.ok(analyticsService.getBookingTariffVisitAnalytics(from, to, restaurantId));
    }

    @Operation(summary = "Export analytics and operational data: xlsx (multi-sheet) or zip (xlsx + separate csv for orders, bookings, stock, journal, shifts)")
    @GetMapping("/export")
    public ResponseEntity<byte[]> exportAnalytics(
        @RequestParam(required = false, defaultValue = "xlsx") String format,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long restaurantId
    ) {
        byte[] data = restaurantDataExportService.export(format, from, to, restaurantId);
        boolean zip = format != null && format.equalsIgnoreCase("zip");
        String ext = zip ? "zip" : "xlsx";
        String fromPart = from != null ? from.toString() : "all";
        String toPart = to != null ? to.toString() : "all";
        String filename = "restaurant_data_" + fromPart + "_" + toPart + "." + ext;
        MediaType ct = zip
            ? MediaType.parseMediaType("application/zip")
            : MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return ResponseEntity.ok()
            .contentType(ct)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
            .body(data);
    }
}
