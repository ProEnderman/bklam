package com.restaurant.controller;

import com.restaurant.dto.*;
import com.restaurant.exception.ApiErrorResponse;
import com.restaurant.exception.HasApiErrorCode;
import com.restaurant.model.GuestSession;
import com.restaurant.service.PublicOrderingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import java.time.ZoneOffset;
import java.util.List;

@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicOrderingController {

    private final PublicOrderingService publicOrderingService;

    // ── 1. GET /api/public/menu?token=... ──

    @GetMapping("/menu")
    public ResponseEntity<?> getMenu(@RequestParam String token, WebRequest webRequest) {
        Long restaurantId = publicOrderingService.validateTokenAndExtractRestaurantId(token);
        if (restaurantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiErrorResponse.of(null, HttpStatus.UNAUTHORIZED, "INVALID_QR_TOKEN",
                            "Invalid or expired QR token"));
        }

        PublicOrderingService.MenuVersion version = publicOrderingService.computeMenuVersion(restaurantId);

        long lastModMillis = version.lastModified() != null
                ? version.lastModified().toInstant(ZoneOffset.UTC).toEpochMilli()
                : -1;

        // Handles weak ETags, multi-value If-None-Match, and If-Modified-Since.
        // Sets ETag + Last-Modified on the response and returns true when 304 is appropriate.
        if (webRequest.checkNotModified(version.etag(), lastModMillis)) {
            return null;
        }

        List<PublicMenuCategoryDto> menu = publicOrderingService.getMenu(restaurantId);

        var builder = ResponseEntity.ok()
                .header(HttpHeaders.ETAG, version.etag())
                .header(HttpHeaders.CACHE_CONTROL, "no-cache");
        if (lastModMillis >= 0) {
            builder.lastModified(lastModMillis);
        }

        return builder.body(menu);
    }

    // ── 2. POST /api/public/sessions ──

    @PostMapping("/sessions")
    public ResponseEntity<?> createSession(@Valid @RequestBody CreateSessionRequest request) {
        Long restaurantId = publicOrderingService.validateTokenAndExtractRestaurantId(request.token());
        if (restaurantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiErrorResponse.of(null, HttpStatus.UNAUTHORIZED, "INVALID_QR_TOKEN",
                            "Invalid or expired QR token"));
        }
        CreateSessionResponse response = publicOrderingService.createSession(restaurantId, request.tableId());
        if (response == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiErrorResponse.of(null, HttpStatus.FORBIDDEN, "TABLE_NOT_IN_RESTAURANT",
                            "Table does not belong to this restaurant"));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // ── 3. GET /api/public/orders/current ──

    @GetMapping("/orders/current")
    public ResponseEntity<?> getCurrentOrder(@RequestHeader(value = "X-Guest-Session", required = false) String sessionToken) {
        GuestSession session = resolveSessionOrThrow(sessionToken);
        OrderDto order = publicOrderingService.getCurrentOrder(session);
        if (order == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiErrorResponse.of(null, HttpStatus.NOT_FOUND, "NO_OPEN_ORDER",
                            "No open order for this table"));
        }
        return ResponseEntity.ok(order);
    }

    // ── 4. POST /api/public/orders ──

    @PostMapping("/orders")
    public ResponseEntity<?> createOrder(
            @RequestHeader(value = "X-Guest-Session", required = false) String sessionToken,
            @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey) {
        GuestSession session = resolveSessionOrThrow(sessionToken);
        OrderDto order = publicOrderingService.createOrGetOrder(session.getId(), idempotencyKey);
        return ResponseEntity.status(HttpStatus.CREATED).body(order);
    }

    // ── 5. POST /api/public/orders/{orderId}/items ──

    @PostMapping("/orders/{orderId}/items")
    public ResponseEntity<?> addItem(
            @RequestHeader(value = "X-Guest-Session", required = false) String sessionToken,
            @PathVariable Long orderId,
            @Valid @RequestBody AddPublicItemRequest request) {
        GuestSession session = resolveSessionOrThrow(sessionToken);
        OrderDto order = publicOrderingService.addItem(session, orderId, request);
        return ResponseEntity.ok(order);
    }

    // ── 6. DELETE /api/public/orders/{orderId}/items/{itemId} ──

    @DeleteMapping("/orders/{orderId}/items/{itemId}")
    public ResponseEntity<?> removeItem(
            @RequestHeader(value = "X-Guest-Session", required = false) String sessionToken,
            @PathVariable Long orderId,
            @PathVariable Long itemId) {
        GuestSession session = resolveSessionOrThrow(sessionToken);
        OrderDto order = publicOrderingService.removeItem(session, orderId, itemId);
        return ResponseEntity.ok(order);
    }

    // ── internal ──

    private GuestSession resolveSessionOrThrow(String sessionToken) {
        if (sessionToken == null || sessionToken.isBlank()) {
            throw new InvalidSessionException("Missing X-Guest-Session");
        }
        GuestSession session = publicOrderingService.resolveSession(sessionToken);
        if (session == null) {
            throw new InvalidSessionException("Invalid or expired guest session");
        }
        return session;
    }

    public static class InvalidSessionException extends RuntimeException implements HasApiErrorCode {
        private final String apiErrorCode;

        public InvalidSessionException(String message) {
            this(message, "INVALID_GUEST_SESSION");
        }

        public InvalidSessionException(String message, String apiErrorCode) {
            super(message);
            this.apiErrorCode = apiErrorCode;
        }

        @Override
        public String getApiErrorCode() {
            return apiErrorCode;
        }
    }
}
