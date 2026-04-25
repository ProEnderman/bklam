package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.Guest;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record GuestDto(
    Long id,
    Long restaurantId,
    String phoneNormalized,
    String name,
    String email,
    LocalDate birthday,
    String consentFlags,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static GuestDto fromEntity(Guest g) {
        return new GuestDto(
            g.getId(),
            g.getRestaurantId(),
            g.getPhoneNormalized(),
            g.getName(),
            g.getEmail(),
            g.getBirthday(),
            g.getConsentFlags(),
            g.getCreatedAt(),
            g.getUpdatedAt()
        );
    }
}
