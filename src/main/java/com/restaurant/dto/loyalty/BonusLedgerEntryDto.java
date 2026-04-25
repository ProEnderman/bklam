package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.BonusLedgerEntry;
import com.restaurant.model.loyalty.LedgerEntryType;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record BonusLedgerEntryDto(
    Long id,
    Long accountId,
    LedgerEntryType entryType,
    BigDecimal amount,
    String pointsUnit,
    String sourceType,
    String sourceId,
    String description,
    String metadata,
    LocalDateTime createdAt
) {
    public static BonusLedgerEntryDto fromEntity(BonusLedgerEntry e) {
        return new BonusLedgerEntryDto(
            e.getId(),
            e.getAccountId(),
            e.getEntryType(),
            e.getAmount(),
            e.getPointsUnit(),
            e.getSourceType(),
            e.getSourceId(),
            e.getDescription(),
            e.getMetadata(),
            e.getCreatedAt()
        );
    }
}
