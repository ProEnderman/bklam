package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.Achievement;

import java.time.LocalDateTime;

public record AchievementDto(
    Long id,
    Long restaurantId,
    String name,
    String description,
    String iconUrl,
    String criteria,
    String reward,
    LocalDateTime createdAt
) {
    public static AchievementDto fromEntity(Achievement a) {
        return new AchievementDto(
            a.getId(),
            a.getRestaurantId(),
            a.getName(),
            a.getDescription(),
            a.getIconUrl(),
            a.getCriteria(),
            a.getReward(),
            a.getCreatedAt()
        );
    }
}
