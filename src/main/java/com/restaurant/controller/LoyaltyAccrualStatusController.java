package com.restaurant.controller;

import com.restaurant.dto.LoyaltyAccrualStatusResponse;
import com.restaurant.model.LoyaltyOrderAccrual;
import com.restaurant.model.LoyaltyOrderAccrualId;
import com.restaurant.repository.LoyaltyOrderAccrualRepository;
import com.restaurant.security.SecurityUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Minimal reconciliation read: accrual guard status for (restaurant, order). HEAD_ADMIN only.
 */
@Tag(name = "Loyalty accrual (platform)", description = "Order-level idempotency guard / reconciliation")
@RestController
@RequestMapping("/api/platform/loyalty/accrual")
@RequiredArgsConstructor
public class LoyaltyAccrualStatusController {

    private final LoyaltyOrderAccrualRepository loyaltyOrderAccrualRepository;

    @Operation(summary = "Get loyalty accrual guard row for an order (idempotency / reconciliation)")
    @GetMapping
    public ResponseEntity<LoyaltyAccrualStatusResponse> get(
            @RequestParam long restaurantId,
            @RequestParam long orderId) {
        if (!SecurityUtils.isHeadAdmin()) {
            return ResponseEntity.status(403).build();
        }
        return loyaltyOrderAccrualRepository
                .findById(new LoyaltyOrderAccrualId(restaurantId, orderId))
                .map(this::toResponse)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    private LoyaltyAccrualStatusResponse toResponse(LoyaltyOrderAccrual a) {
        return new LoyaltyAccrualStatusResponse(
                a.getRestaurantId(), a.getOrderId(), a.getStatus(), a.getCreatedAt(), a.getUpdatedAt());
    }
}
