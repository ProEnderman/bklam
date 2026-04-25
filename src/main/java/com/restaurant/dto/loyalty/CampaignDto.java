package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.Campaign;
import com.restaurant.model.loyalty.CampaignStatus;
import com.restaurant.model.loyalty.CampaignType;

import java.time.LocalDateTime;

public record CampaignDto(
    Long id,
    Long restaurantId,
    String name,
    CampaignType campaignType,
    String rules,
    String schedule,
    CampaignStatus status,
    Integer priority,
    LocalDateTime validFrom,
    LocalDateTime validTo,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static CampaignDto fromEntity(Campaign c) {
        return new CampaignDto(
            c.getId(),
            c.getRestaurantId(),
            c.getName(),
            c.getCampaignType(),
            c.getRules(),
            c.getSchedule(),
            c.getStatus(),
            c.getPriority(),
            c.getValidFrom(),
            c.getValidTo(),
            c.getCreatedAt(),
            c.getUpdatedAt()
        );
    }
}
