package com.restaurant.dto.loyalty;

import java.util.List;

/**
 * Composite DTO: full guest profile with bonus, tier, achievements, mission progress
 */
public record GuestProfileDto(
    GuestDto guest,
    BonusAccountDto bonusAccount,
    TierDto currentTier,
    List<MissionProgressDto> activeMissions,
    List<AchievementDto> achievements,
    RfmSnapshotDto rfmSnapshot
) {}
