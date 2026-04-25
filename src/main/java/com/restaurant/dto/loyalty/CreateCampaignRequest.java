package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.CampaignType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;

public record CreateCampaignRequest(
    @NotBlank String name,
    @NotNull CampaignType campaignType,
    String rules,
    String schedule,
    Integer priority,
    LocalDateTime validFrom,
    LocalDateTime validTo
) {}
