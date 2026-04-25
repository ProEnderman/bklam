package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.RfmSnapshot;

import java.math.BigDecimal;
import java.time.LocalDate;

public record RfmSnapshotDto(
    Long id,
    Long guestId,
    LocalDate snapshotDate,
    Integer recencyDays,
    Integer frequencyCount,
    BigDecimal monetarySum,
    Integer rScore,
    Integer fScore,
    Integer mScore,
    String rfmSegment
) {
    public static RfmSnapshotDto fromEntity(RfmSnapshot r) {
        return new RfmSnapshotDto(
            r.getId(),
            r.getGuest().getId(),
            r.getSnapshotDate(),
            r.getRecencyDays(),
            r.getFrequencyCount(),
            r.getMonetarySum(),
            r.getRScore(),
            r.getFScore(),
            r.getMScore(),
            r.getRfmSegment()
        );
    }
}
