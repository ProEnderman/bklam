package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.Tier;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record TierDto(
    Long id,
    Long restaurantId,
    @NotBlank String name,
    Integer level,
    BigDecimal threshold,
    BigDecimal cashbackPercent,
    String benefits,
    LocalDateTime validFrom,
    LocalDateTime validTo,
    LocalDateTime createdAt
) {
    public static TierDto fromEntity(Tier t) {
        return new TierDto(
            t.getId(),
            t.getRestaurantId(),
            t.getName(),
            t.getLevel(),
            t.getThreshold(),
            t.getCashbackPercent(),
            t.getBenefits(),
            t.getValidFrom(),
            t.getValidTo(),
            t.getCreatedAt()
        );
    }
}
