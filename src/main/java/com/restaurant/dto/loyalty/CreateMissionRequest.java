package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.MissionType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;

public record CreateMissionRequest(
    @NotBlank String name,
    String description,
    @NotNull MissionType missionType,
    String goal,
    String reward,
    LocalDateTime validFrom,
    LocalDateTime validTo
) {}
