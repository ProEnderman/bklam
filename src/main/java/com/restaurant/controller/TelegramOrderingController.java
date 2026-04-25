package com.restaurant.controller;

import com.restaurant.dto.AddPublicItemRequest;
import com.restaurant.dto.OrderDto;
import com.restaurant.dto.PublicMenuCategoryDto;
import com.restaurant.exception.ApiErrorResponse;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.TelegramSession;
import com.restaurant.security.TelegramWebAppAuthUtil;
import com.restaurant.service.PublicOrderingService;
import com.restaurant.service.TelegramOrderingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Tag(name = "Telegram Ordering", description = "Customer ordering flow via Telegram")
@Slf4j
@RestController
@RequestMapping("/api/telegram")
@RequiredArgsConstructor
public class TelegramOrderingController {

    private final TelegramOrderingService telegramOrderingService;
    private final TelegramWebAppAuthUtil telegramWebAppAuthUtil;

    @Value("${telegram.webhook.enabled:false}")
    private boolean webhookEnabled;

    @Value("${telegram.webhook.secret:}")
    private String webhookSecret;

    // ── Secret validation (applied to all endpoints) ──

    private ResponseEntity<ApiErrorResponse> validateSecret(String secret) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            log.warn("telegram.webhook.secret is not configured");
            return unauthorized();
        }
        if (secret == null || !webhookSecret.equals(secret)) {
            return unauthorized();
        }
        return null;
    }

    private ResponseEntity<ApiErrorResponse> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiErrorResponse.of(null, HttpStatus.UNAUTHORIZED, "TELEGRAM_WEBHOOK_SECRET_INVALID",
                        "Invalid or missing secret"));
    }

    private ResponseEntity<ApiErrorResponse> invalidInitData() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiErrorResponse.of(null, HttpStatus.UNAUTHORIZED, "TELEGRAM_INIT_DATA_INVALID",
                        "Invalid Telegram initData"));
    }

    private Optional<Long> resolveUserFromInitData(String initData, Long explicitRestaurantId, Long fallbackTelegramUserId) {
        if (initData == null || initData.isBlank()) {
            return Optional.empty();
        }

        Long restaurantIdHint = explicitRestaurantId;
        if (restaurantIdHint == null) {
            restaurantIdHint = telegramWebAppAuthUtil.extractRestaurantIdHint(initData).orElse(null);
        }
        if (restaurantIdHint == null) {
            Long unsafeUserId = telegramWebAppAuthUtil.extractUserIdUnsafe(initData).orElse(fallbackTelegramUserId);
            if (unsafeUserId != null) {
                restaurantIdHint = telegramOrderingService.findRestaurantIdByTelegramUserId(unsafeUserId).orElse(null);
            }
        }

        String restaurantToken = telegramOrderingService.getRestaurantTelegramBotToken(restaurantIdHint).orElse(null);
        Optional<Long> validated = telegramWebAppAuthUtil.validateAndExtractUserId(initData, restaurantToken);
        if (validated.isPresent()) {
            return validated;
        }

        // Backward compatibility: if per-restaurant token is absent/mismatched, try global token.
        return telegramWebAppAuthUtil.validateAndExtractUserId(initData);
    }

    private Optional<Long> resolveRestaurantIdFromInitData(String initData) {
        if (initData == null || initData.isBlank()) return Optional.empty();
        return telegramOrderingService.getRestaurantsWithTelegramBotToken().stream()
                .filter(r -> telegramWebAppAuthUtil
                        .validateAndExtractUserId(initData, r.getTelegramBotToken())
                        .isPresent())
                .map(com.restaurant.model.Restaurant::getId)
                .findFirst();
    }

    // ── A) Webhook (simple command dispatch) ──

    @Operation(summary = "Telegram webhook receiver")
    @PostMapping("/webhook")
    public ResponseEntity<?> webhook(
            @RequestHeader(value = "X-Telegram-Secret", required = false) String secret,
            @RequestBody Map<String, Object> update) {
        if (!webhookEnabled) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiErrorResponse.of(null, HttpStatus.NOT_FOUND, "WEBHOOK_DISABLED",
                            "Telegram webhook is disabled. Set TELEGRAM_WEBHOOK_ENABLED=true when using POST /api/telegram/webhook."));
        }
        var authErr = validateSecret(secret);
        if (authErr != null) return authErr;

        try {
            Map<String, Object> message = extractMessage(update);
            if (message == null) {
                return ResponseEntity.ok(Map.of("message", "No message in update"));
            }

            Long chatId = extractLong(message, "chat", "id");
            Long userId = extractLong(message, "from", "id");
            String text = (String) message.get("text");

            if (chatId == null || userId == null || text == null || text.isBlank()) {
                return ResponseEntity.ok(Map.of("message", "Ignored (missing fields)"));
            }

            text = text.trim();
            return dispatchCommand(userId, text);
        } catch (ResourceNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiErrorResponse.of(null, HttpStatus.NOT_FOUND, e.getApiErrorCode(), e.getMessage()));
        } catch (BusinessException e) {
            return ResponseEntity.badRequest()
                    .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, e.getApiErrorCode(), e.getMessage()));
        } catch (TelegramOrderingService.AccessDeniedException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiErrorResponse.of(null, HttpStatus.FORBIDDEN, e.getApiErrorCode(), e.getMessage()));
        } catch (Exception e) {
            log.error("Webhook processing error", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiErrorResponse.of(null, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                            "Internal error"));
        }
    }

    private ResponseEntity<?> dispatchCommand(Long userId, String text) {
        if (text.equalsIgnoreCase("/start")) {
            return ResponseEntity.ok(Map.of("message", "Welcome. Type 'menu'."));
        }

        if (text.equalsIgnoreCase("menu")) {
            TelegramSession session = telegramOrderingService.resolveSession(userId, null);
            List<PublicMenuCategoryDto> menu = telegramOrderingService.getMenu(session.getRestaurantId());
            return ResponseEntity.ok(menu);
        }

        if (text.equalsIgnoreCase("cart")) {
            TelegramSession session = telegramOrderingService.resolveSession(userId, null);
            OrderDto order = telegramOrderingService.createOrGetCurrentOrder(session);
            Map<String, Object> cart = new LinkedHashMap<>();
            cart.put("orderId", order.id());
            cart.put("status", order.status());
            cart.put("totalAmount", order.totalAmount());
            cart.put("items", order.items().stream().map(i -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("itemId", i.id());
                m.put("dishName", i.dishName());
                m.put("qty", i.qty());
                m.put("lineTotal", i.lineTotal());
                return m;
            }).toList());
            return ResponseEntity.ok(cart);
        }

        if (text.toLowerCase().startsWith("add ")) {
            String[] parts = text.split("\\s+");
            if (parts.length < 3) {
                return ResponseEntity.badRequest()
                        .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, "INVALID_USAGE",
                                "Usage: add <dishId> <qty>"));
            }
            long dishId = Long.parseLong(parts[1]);
            int qty = Integer.parseInt(parts[2]);
            TelegramSession session = telegramOrderingService.resolveSession(userId, null);
            OrderDto order = telegramOrderingService.createOrGetCurrentOrder(session);
            OrderDto updated = telegramOrderingService.addItem(session, order.id(), dishId, qty, null, List.of());
            return ResponseEntity.ok(updated);
        }

        if (text.toLowerCase().startsWith("remove ")) {
            String[] parts = text.split("\\s+");
            if (parts.length < 2) {
                return ResponseEntity.badRequest()
                        .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, "INVALID_USAGE",
                                "Usage: remove <itemId>"));
            }
            long itemId = Long.parseLong(parts[1]);
            TelegramSession session = telegramOrderingService.resolveSession(userId, null);
            OrderDto order = telegramOrderingService.createOrGetCurrentOrder(session);
            OrderDto updated = telegramOrderingService.removeItem(session, order.id(), itemId);
            return ResponseEntity.ok(updated);
        }

        if (text.equalsIgnoreCase("clear")) {
            TelegramSession session = telegramOrderingService.resolveSession(userId, null);
            OrderDto order = telegramOrderingService.createOrGetCurrentOrder(session);
            OrderDto updated = telegramOrderingService.clearItems(session, order.id());
            return ResponseEntity.ok(updated);
        }

        return ResponseEntity.ok(Map.of("message", "Unknown command. Try: /start, menu, cart, add <dishId> <qty>, remove <itemId>, clear"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractMessage(Map<String, Object> update) {
        if (update.containsKey("message")) {
            return (Map<String, Object>) update.get("message");
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Long extractLong(Map<String, Object> message, String objectKey, String field) {
        Object obj = message.get(objectKey);
        if (obj instanceof Map) {
            Object val = ((Map<String, Object>) obj).get(field);
            if (val instanceof Number) return ((Number) val).longValue();
        }
        return null;
    }

    // ── B) Menu endpoint ──

    @Operation(summary = "Get menu for a restaurant (Telegram)")
    @GetMapping("/menu")
    public ResponseEntity<?> getMenu(
            @RequestHeader(value = "X-Telegram-Secret", required = false) String secret,
            @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
            @RequestParam(required = false) Long restaurantId,
            WebRequest webRequest) {
        try {
            Long resolvedId;
            boolean hasInitData = initData != null && !initData.isBlank();
            Optional<Long> initUserId = resolveUserFromInitData(initData, restaurantId, null);
            if (hasInitData && initUserId.isEmpty()) {
                log.warn("Telegram menu rejected: invalid initData (len={})",
                        initData != null ? initData.length() : 0);
                return invalidInitData();
            }
            if (initUserId.isPresent()) {
                Long resolvedRestaurantId = restaurantId != null ? restaurantId : resolveRestaurantIdFromInitData(initData).orElse(null);
                TelegramSession session = telegramOrderingService.resolveSession(initUserId.get(), resolvedRestaurantId);
                resolvedId = session.getRestaurantId();
            } else {
                var authErr = validateSecret(secret);
                if (authErr != null) return authErr;
                resolvedId = telegramOrderingService.resolveRestaurantId(restaurantId);
            }

            PublicOrderingService.MenuVersion version = telegramOrderingService.computeMenuVersion(resolvedId);

            long lastModMillis = version.lastModified() != null
                    ? version.lastModified().toInstant(ZoneOffset.UTC).toEpochMilli()
                    : -1;

            if (webRequest.checkNotModified(version.etag(), lastModMillis)) {
                return null;
            }

            List<PublicMenuCategoryDto> menu = telegramOrderingService.getMenu(resolvedId);
            String restaurantName = telegramOrderingService.getRestaurantName(resolvedId).orElse("Telegram Shop");

            var builder = ResponseEntity.ok()
                    .header(HttpHeaders.ETAG, version.etag())
                    .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                    .header("X-Restaurant-Name", restaurantName);
            if (lastModMillis >= 0) {
                builder.lastModified(lastModMillis);
            }
            return builder.body(menu);
        } catch (BusinessException e) {
            return ResponseEntity.badRequest()
                    .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, e.getApiErrorCode(), e.getMessage()));
        } catch (ResourceNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiErrorResponse.of(null, HttpStatus.NOT_FOUND, e.getApiErrorCode(), e.getMessage()));
        }
    }

    // ── C) Order: create/get current ──

    @Operation(summary = "Create or get current OPEN order")
    @PostMapping("/orders/current")
    public ResponseEntity<?> createOrGetOrder(
            @RequestHeader(value = "X-Telegram-Secret", required = false) String secret,
            @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
            @RequestBody Map<String, Object> body) {
        try {
            boolean hasInitData = initData != null && !initData.isBlank();
            Long restaurantId = extractBodyLong(body, "restaurantId");
            Long bodyUserId = extractBodyLong(body, "telegramUserId");
            Optional<Long> initUserId = resolveUserFromInitData(initData, restaurantId, bodyUserId);
            if (hasInitData && initUserId.isEmpty()) {
                log.warn("Telegram create/get current order rejected: invalid initData");
                return invalidInitData();
            }
            if (!hasInitData && initUserId.isEmpty()) {
                var authErr = validateSecret(secret);
                if (authErr != null) return authErr;
            }
            Long userId = initUserId.orElseGet(() -> extractUserId(body));
            if (restaurantId == null && hasInitData) {
                restaurantId = resolveRestaurantIdFromInitData(initData).orElse(null);
            }
            TelegramSession session = telegramOrderingService.resolveSession(userId, restaurantId);
            OrderDto order = telegramOrderingService.createOrGetCurrentOrder(session);
            return ResponseEntity.status(HttpStatus.CREATED).body(order);
        } catch (BusinessException e) {
            return ResponseEntity.badRequest()
                    .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, e.getApiErrorCode(), e.getMessage()));
        } catch (ResourceNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiErrorResponse.of(null, HttpStatus.NOT_FOUND, e.getApiErrorCode(), e.getMessage()));
        } catch (Exception e) {
            log.error("Telegram create/get current order failed", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiErrorResponse.of(null, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                            "Internal error while creating order"));
        }
    }

    // ── D) Order: add item ──

    @Operation(summary = "Add item to order")
    @PostMapping("/orders/{orderId}/items")
    public ResponseEntity<?> addItem(
            @RequestHeader(value = "X-Telegram-Secret", required = false) String secret,
            @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
            @PathVariable Long orderId,
            @RequestBody Map<String, Object> body) {
        try {
            boolean hasInitData = initData != null && !initData.isBlank();
            Long bodyUserId = extractBodyLong(body, "telegramUserId");
            Optional<Long> initUserId = resolveUserFromInitData(initData, null, bodyUserId);
            if (hasInitData && initUserId.isEmpty()) {
                log.warn("Telegram add item rejected: invalid initData orderId={}", orderId);
                return invalidInitData();
            }
            if (!hasInitData && initUserId.isEmpty()) {
                var authErr = validateSecret(secret);
                if (authErr != null) return authErr;
            }
            Long userId = initUserId.orElseGet(() -> extractUserId(body));
            Long dishId = extractBodyLong(body, "dishId");
            Integer qty = extractBodyInt(body, "qty");
            String comment = (String) body.get("comment");

            if (dishId == null) throw new BusinessException("dishId is required");
            if (qty == null || qty <= 0) throw new BusinessException("qty must be > 0");

            List<AddPublicItemRequest.OptionSelection> selections = extractSelections(body);

            TelegramSession session = telegramOrderingService.resolveSession(userId, null);
            OrderDto order = telegramOrderingService.addItem(session, orderId, dishId, qty, comment, selections);
            return ResponseEntity.ok(order);
        } catch (BusinessException e) {
            return ResponseEntity.badRequest()
                    .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, e.getApiErrorCode(), e.getMessage()));
        } catch (ResourceNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiErrorResponse.of(null, HttpStatus.NOT_FOUND, e.getApiErrorCode(), e.getMessage()));
        } catch (TelegramOrderingService.AccessDeniedException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiErrorResponse.of(null, HttpStatus.FORBIDDEN, e.getApiErrorCode(), e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, "BAD_REQUEST", e.getMessage()));
        } catch (Exception e) {
            log.error("Telegram add item failed: orderId={}", orderId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiErrorResponse.of(null, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                            "Internal error while adding item"));
        }
    }

    private List<AddPublicItemRequest.OptionSelection> extractSelections(Map<String, Object> body) {
        Object raw = body.get("selections");
        if (raw == null || !(raw instanceof List)) return List.of();
        List<?> list = (List<?>) raw;
        List<AddPublicItemRequest.OptionSelection> out = new java.util.ArrayList<>();
        for (Object el : list) {
            if (!(el instanceof Map)) continue;
            @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) el;
            Long groupInstanceId = extractBodyLong(m, "groupInstanceId");
            if (groupInstanceId == null) continue;
            Long optionItemId = extractBodyLong(m, "optionItemId");
            Integer optionQty = extractBodyInt(m, "optionQty");
            Integer valueInt = extractBodyInt(m, "valueInt");
            out.add(new AddPublicItemRequest.OptionSelection(groupInstanceId, optionItemId, optionQty, valueInt));
        }
        return out;
    }

    // ── E) Order: remove item ──

    @Operation(summary = "Remove item from order")
    @DeleteMapping("/orders/{orderId}/items/{itemId}")
    public ResponseEntity<?> removeItem(
            @RequestHeader(value = "X-Telegram-Secret", required = false) String secret,
            @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
            @PathVariable Long orderId,
            @PathVariable Long itemId,
            @RequestParam(required = false) Long telegramUserId) {
        try {
            boolean hasInitData = initData != null && !initData.isBlank();
            Optional<Long> initUserId = resolveUserFromInitData(initData, null, telegramUserId);
            if (hasInitData && initUserId.isEmpty()) {
                log.warn("Telegram remove item rejected: invalid initData orderId={} itemId={}", orderId, itemId);
                return invalidInitData();
            }
            if (!hasInitData && initUserId.isEmpty()) {
                var authErr = validateSecret(secret);
                if (authErr != null) return authErr;
            }
            Long userId = initUserId.orElse(telegramUserId);
            if (userId == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(ApiErrorResponse.of(null, HttpStatus.UNAUTHORIZED, "TELEGRAM_USER_REQUIRED",
                                "telegramUserId is required"));
            }
            TelegramSession session = telegramOrderingService.resolveSession(userId, null);
            OrderDto order = telegramOrderingService.removeItem(session, orderId, itemId);
            return ResponseEntity.ok(order);
        } catch (BusinessException e) {
            return ResponseEntity.badRequest()
                    .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, e.getApiErrorCode(), e.getMessage()));
        } catch (ResourceNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiErrorResponse.of(null, HttpStatus.NOT_FOUND, e.getApiErrorCode(), e.getMessage()));
        } catch (TelegramOrderingService.AccessDeniedException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiErrorResponse.of(null, HttpStatus.FORBIDDEN, e.getApiErrorCode(), e.getMessage()));
        }
    }

    // ── F) Order: get by id ──

    @Operation(summary = "Get order by ID")
    @GetMapping("/orders/{orderId}")
    public ResponseEntity<?> getOrder(
            @RequestHeader(value = "X-Telegram-Secret", required = false) String secret,
            @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
            @PathVariable Long orderId,
            @RequestParam(required = false) Long telegramUserId) {
        try {
            boolean hasInitData = initData != null && !initData.isBlank();
            Optional<Long> initUserId = resolveUserFromInitData(initData, null, telegramUserId);
            if (hasInitData && initUserId.isEmpty()) {
                log.warn("Telegram get order rejected: invalid initData orderId={}", orderId);
                return invalidInitData();
            }
            if (!hasInitData && initUserId.isEmpty()) {
                var authErr = validateSecret(secret);
                if (authErr != null) return authErr;
            }
            Long userId = initUserId.orElse(telegramUserId);
            if (userId == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(ApiErrorResponse.of(null, HttpStatus.UNAUTHORIZED, "TELEGRAM_USER_REQUIRED",
                                "telegramUserId is required"));
            }
            TelegramSession session = telegramOrderingService.resolveSession(userId, null);
            OrderDto order = telegramOrderingService.getOrder(session, orderId);
            return ResponseEntity.ok(order);
        } catch (ResourceNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiErrorResponse.of(null, HttpStatus.NOT_FOUND, e.getApiErrorCode(), e.getMessage()));
        } catch (TelegramOrderingService.AccessDeniedException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiErrorResponse.of(null, HttpStatus.NOT_FOUND, "NOT_FOUND", "Order not found"));
        }
    }

    // ── Helpers ──

    private Long extractUserId(Map<String, Object> body) {
        Long userId = extractBodyLong(body, "telegramUserId");
        if (userId == null) {
            throw new BusinessException("telegramUserId is required");
        }
        return userId;
    }

    private Long extractBodyLong(Map<String, Object> body, String key) {
        Object val = body.get(key);
        if (val instanceof Number) return ((Number) val).longValue();
        if (val instanceof String) {
            try { return Long.parseLong((String) val); } catch (NumberFormatException e) { return null; }
        }
        return null;
    }

    private Integer extractBodyInt(Map<String, Object> body, String key) {
        Object val = body.get(key);
        if (val instanceof Number) return ((Number) val).intValue();
        if (val instanceof String) {
            try { return Integer.parseInt((String) val); } catch (NumberFormatException e) { return null; }
        }
        return null;
    }
}
