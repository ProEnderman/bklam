package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.BonusAccount;
import com.restaurant.model.loyalty.BonusAccountStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record BonusAccountDto(
    Long id,
    Long guestId,
    BonusAccountStatus status,
    BigDecimal currentBalance,
    BigDecimal totalEarned,
    BigDecimal totalBurned,
    LocalDateTime updatedAt
) {
    public static BonusAccountDto fromEntity(BonusAccount a) {
        return fromEntity(a, null, null);
    }

    public static BonusAccountDto fromEntity(BonusAccount a, BigDecimal totalEarned, BigDecimal totalBurned) {
        return new BonusAccountDto(
            a.getId(),
            a.getGuestId(),
            a.getStatus(),
            a.getCurrentBalance(),
            totalEarned,
            totalBurned,
            a.getUpdatedAt()
        );
    }
}
