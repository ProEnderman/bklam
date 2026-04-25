package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.Segment;

import java.time.LocalDateTime;

public record SegmentDto(
    Long id,
    Long restaurantId,
    String name,
    String definition,
    Integer guestCount,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static SegmentDto fromEntity(Segment s) {
        return new SegmentDto(
            s.getId(),
            s.getRestaurantId(),
            s.getName(),
            s.getDefinition(),
            s.getGuestCount(),
            s.getCreatedAt(),
            s.getUpdatedAt()
        );
    }
}
