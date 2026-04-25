package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.MissionProgress;
import com.restaurant.model.loyalty.MissionProgressStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record MissionProgressDto(
    Long id,
    Long guestId,
    Long missionId,
    String missionName,
    BigDecimal currentValue,
    BigDecimal goalValue,
    double progressPercent,
    MissionProgressStatus status,
    LocalDateTime startedAt,
    LocalDateTime completedAt
) {
    public static MissionProgressDto fromEntity(MissionProgress p) {
        double percent = p.getGoalValue().compareTo(BigDecimal.ZERO) > 0
            ? p.getCurrentValue().doubleValue() / p.getGoalValue().doubleValue() * 100.0
            : 0.0;
        return new MissionProgressDto(
            p.getId(),
            p.getGuest().getId(),
            p.getMission().getId(),
            p.getMission().getName(),
            p.getCurrentValue(),
            p.getGoalValue(),
            Math.min(percent, 100.0),
            p.getStatus(),
            p.getStartedAt(),
            p.getCompletedAt()
        );
    }
}
