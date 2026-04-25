package com.restaurant.dto;

import com.restaurant.model.LegalEntity;

import java.time.LocalDateTime;

public record LegalEntityDto(
    Long id,
    Long holdingId,
    String name,
    String inn,
    String kpp,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static LegalEntityDto fromEntity(LegalEntity e) {
        return new LegalEntityDto(
            e.getId(),
            e.getHolding() != null ? e.getHolding().getId() : null,
            e.getName(),
            e.getInn(),
            e.getKpp(),
            e.getCreatedAt(),
            e.getUpdatedAt()
        );
    }
}
