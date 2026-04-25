package com.restaurant.controller;

import com.restaurant.exception.ApiErrorResponse;
import com.restaurant.forecast.ForecastUpdateInProgressStore;
import com.restaurant.forecast.InternalForecastJwtService;
import com.restaurant.tenant.TenantContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Proxies forecast requests to the Python forecasting microservice.
 * Sends internal JWT (5 min) with tenant_id so FastAPI does not need DB access.
 */
@Slf4j
@Tag(name = "Forecast", description = "ML-based forecasting (Prophet / SARIMA)")
@RestController
@RequestMapping("/api/forecast")
@RequiredArgsConstructor
public class ForecastController {

    @Value("${forecast.service.url:http://localhost:8090}")
    private String forecastServiceUrl;

    private final RestTemplate rest = new RestTemplate();
    private final InternalForecastJwtService internalForecastJwtService;
    private final ForecastUpdateInProgressStore updateInProgressStore;

    // ─── Forecast ───────────────────────────────────

    @Operation(summary = "Get forecast for a metric")
    @GetMapping("/{metric}")
    public ResponseEntity<?> getForecast(
            @PathVariable String metric,
            @RequestParam(defaultValue = "14") int horizon,
            @RequestParam(required = false) Long restaurantId,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            @RequestParam(name = "force_refresh", required = false) Boolean forceRefresh,
            @RequestParam(required = false) String breakdown,
            @RequestParam(required = false) Boolean hierarchical
    ) {
        Long tenantId = restaurantId != null ? restaurantId : TenantContext.get();
        StringBuilder url = new StringBuilder(String.format(
                "%s/api/forecast/%s?horizon=%d", forecastServiceUrl, metric, horizon));
        if (tenantId != null) url.append("&restaurant_id=").append(tenantId);
        if (period != null) url.append("&period=").append(period);
        if (year != null) url.append("&year=").append(year);
        if (month != null) url.append("&month=").append(month);
        if (forceRefresh != null) url.append("&force_refresh=").append(forceRefresh);
        if (breakdown != null) url.append("&breakdown=").append(breakdown);
        if (hierarchical != null) url.append("&hierarchical=").append(hierarchical);
        return proxyGet(url.toString(), tenantId);
    }

    @Operation(summary = "Get model accuracy for a metric")
    @GetMapping("/{metric}/accuracy")
    public ResponseEntity<?> getAccuracy(
            @PathVariable String metric,
            @RequestParam(required = false) Long restaurantId
    ) {
        Long tenantId = restaurantId != null ? restaurantId : TenantContext.get();
        return proxyGet(String.format(
                "%s/api/forecast/%s/accuracy%s",
                forecastServiceUrl, metric,
                tenantId != null ? "?restaurant_id=" + tenantId : ""
        ), tenantId);
    }

    @Operation(summary = "Actual vs forecast comparison")
    @GetMapping("/{metric}/vs-actual")
    public ResponseEntity<?> vsActual(
            @PathVariable String metric,
            @RequestParam(required = false) Long restaurantId
    ) {
        Long tenantId = restaurantId != null ? restaurantId : TenantContext.get();
        return proxyGet(String.format(
                "%s/api/forecast/%s/vs-actual%s",
                forecastServiceUrl, metric,
                tenantId != null ? "?restaurant_id=" + tenantId : ""
        ), tenantId);
    }

    @Operation(summary = "Whether forecast is currently being updated for the current restaurant (e.g. weekly job or manual refresh)")
    @GetMapping("/updating")
    public ResponseEntity<?> updating(@RequestParam(required = false) Long restaurantId) {
        Long tenantId = restaurantId != null ? restaurantId : TenantContext.get();
        boolean updating = tenantId != null && updateInProgressStore.isInProgress(tenantId);
        return ResponseEntity.ok(Map.of("updating", updating));
    }

    @Operation(summary = "All metrics forecast summary")
    @GetMapping("/summary")
    public ResponseEntity<?> summary(
            @RequestParam(defaultValue = "14") int horizon,
            @RequestParam(required = false) Long restaurantId
    ) {
        Long tenantId = restaurantId != null ? restaurantId : TenantContext.get();
        if (tenantId != null) updateInProgressStore.setInProgress(tenantId, true);
        try {
            return proxyGet(String.format(
                    "%s/api/forecast/summary?horizon=%d%s",
                    forecastServiceUrl, horizon,
                    tenantId != null ? "&restaurant_id=" + tenantId : ""
            ), tenantId);
        } finally {
            if (tenantId != null) updateInProgressStore.setInProgress(tenantId, false);
        }
    }

    // ─── Month progress ──────────────────────────────

    @Operation(summary = "Month-to-date progress for a metric")
    @GetMapping("/{metric}/month-progress")
    public ResponseEntity<?> monthProgress(
            @PathVariable String metric,
            @RequestParam int year,
            @RequestParam int month,
            @RequestParam(required = false) Long restaurantId
    ) {
        Long tenantId = restaurantId != null ? restaurantId : TenantContext.get();
        return proxyGet(String.format(
                "%s/api/forecast/%s/month-progress?year=%d&month=%d%s",
                forecastServiceUrl, metric, year, month,
                tenantId != null ? "&restaurant_id=" + tenantId : ""
        ), tenantId);
    }

    // ─── Monthly accuracy history ───────────────────

    @Operation(summary = "Monthly accuracy history for a metric")
    @GetMapping("/{metric}/monthly-accuracy")
    public ResponseEntity<?> monthlyAccuracy(
            @PathVariable String metric,
            @RequestParam(defaultValue = "12") int limit,
            @RequestParam(required = false) Long restaurantId
    ) {
        Long tenantId = restaurantId != null ? restaurantId : TenantContext.get();
        return proxyGet(String.format(
                "%s/api/forecast/%s/monthly-accuracy?limit=%d%s",
                forecastServiceUrl, metric, limit,
                tenantId != null ? "&restaurant_id=" + tenantId : ""
        ), tenantId);
    }

    // ─── Training ───────────────────────────────────

    @Operation(summary = "Trigger model training")
    @PostMapping("/train/{metric}")
    public ResponseEntity<?> train(
            @PathVariable String metric,
            @RequestParam(required = false) Long restaurantId,
            @RequestParam(defaultValue = "false") boolean force
    ) {
        Long tenantId = restaurantId != null ? restaurantId : TenantContext.get();
        if (tenantId != null) updateInProgressStore.setInProgress(tenantId, true);
        try {
            String url = String.format(
                    "%s/api/forecast/train/%s?force=%s%s",
                    forecastServiceUrl, metric, force,
                    tenantId != null ? "&restaurant_id=" + tenantId : ""
            );
            HttpHeaders headers = new HttpHeaders();
            if (tenantId != null) {
                headers.setBearerAuth(internalForecastJwtService.issue(tenantId));
            }
            ResponseEntity<String> resp = rest.exchange(url, HttpMethod.POST, new HttpEntity<>(headers), String.class);
            return ResponseEntity.status(resp.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(resp.getBody());
        } catch (RestClientException e) {
            log.error("Forecast service unavailable: {}", e.getMessage());
            return forecastServiceUnavailable();
        } finally {
            if (tenantId != null) updateInProgressStore.setInProgress(tenantId, false);
        }
    }

    // ─── Health ─────────────────────────────────────

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        try {
            ResponseEntity<String> resp = rest.getForEntity(
                    forecastServiceUrl + "/health", String.class
            );
            return ResponseEntity.ok(resp.getBody());
        } catch (RestClientException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(ApiErrorResponse.of(null, HttpStatus.SERVICE_UNAVAILABLE, "FORECAST_SERVICE_UNAVAILABLE",
                            "Forecast service not running"));
        }
    }

    // ─── Helper ─────────────────────────────────────

    private ResponseEntity<?> proxyGet(String url, Long tenantId) {
        if (tenantId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(ApiErrorResponse.of(null, HttpStatus.FORBIDDEN, "RESTAURANT_REQUIRED",
                            "Выберите ресторан для просмотра прогнозов"));
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(internalForecastJwtService.issue(tenantId));
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            ResponseEntity<String> resp = rest.exchange(url, HttpMethod.GET, entity, String.class);
            return ResponseEntity.status(resp.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(resp.getBody());
        } catch (RestClientException e) {
            log.error("Forecast service unavailable: {}", e.getMessage());
            return forecastServiceUnavailable();
        }
    }

    private ResponseEntity<?> forecastServiceUnavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiErrorResponse.of(null, HttpStatus.SERVICE_UNAVAILABLE, "FORECAST_SERVICE_UNAVAILABLE",
                        "Сервис прогнозирования недоступен. Запустите: cd forecasting && python main.py"));
    }
}
