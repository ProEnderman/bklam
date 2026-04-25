package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.Mission;
import com.restaurant.model.loyalty.MissionType;

import java.time.LocalDateTime;

public record MissionDto(
    Long id,
    Long restaurantId,
    String name,
    String description,
    MissionType missionType,
    String goal,
    String reward,
    String status,
    LocalDateTime validFrom,
    LocalDateTime validTo,
    LocalDateTime createdAt
) {
    public static MissionDto fromEntity(Mission m) {
        return new MissionDto(
            m.getId(),
            m.getRestaurantId(),
            m.getName(),
            m.getDescription(),
            m.getMissionType(),
            m.getGoal(),
            m.getReward(),
            m.getStatus(),
            m.getValidFrom(),
            m.getValidTo(),
            m.getCreatedAt()
        );
    }
}
