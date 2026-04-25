package com.restaurant.dto.loyalty;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;

public record BonusTransactionRequest(
    @NotNull Long guestId,
    @NotNull @Positive BigDecimal amount,
    String sourceType,   // ORDER, CAMPAIGN, MANUAL, REFERRAL
    String sourceId,     // order_id, campaign_id, etc.
    String description,
    String idempotencyKey
) {}
