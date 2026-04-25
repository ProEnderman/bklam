package com.restaurant.dto.loyalty;

import com.restaurant.model.loyalty.OfferStatus;
import com.restaurant.model.loyalty.PersonalizedOffer;

import java.time.LocalDateTime;

public record PersonalizedOfferDto(
    Long id,
    Long guestId,
    Long campaignId,
    String campaignName,
    String reason,
    OfferStatus status,
    LocalDateTime validFrom,
    LocalDateTime validTo,
    LocalDateTime createdAt
) {
    public static PersonalizedOfferDto fromEntity(PersonalizedOffer o) {
        return new PersonalizedOfferDto(
            o.getId(),
            o.getGuest().getId(),
            o.getCampaign().getId(),
            o.getCampaign().getName(),
            o.getReason(),
            o.getStatus(),
            o.getValidFrom(),
            o.getValidTo(),
            o.getCreatedAt()
        );
    }
}
