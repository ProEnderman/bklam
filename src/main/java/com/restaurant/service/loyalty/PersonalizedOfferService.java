package com.restaurant.service.loyalty;

import com.restaurant.dto.loyalty.PersonalizedOfferDto;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.loyalty.*;
import com.restaurant.repository.loyalty.CampaignRepository;
import com.restaurant.repository.loyalty.GuestRepository;
import com.restaurant.repository.loyalty.PersonalizedOfferRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PersonalizedOfferService {

    private final PersonalizedOfferRepository offerRepository;
    private final GuestRepository guestRepository;
    private final CampaignRepository campaignRepository;

    @Transactional(readOnly = true)
    public Page<PersonalizedOfferDto> getGuestOffers(Long guestId, Pageable pageable) {
        return offerRepository.findByGuestId(guestId, pageable)
            .map(PersonalizedOfferDto::fromEntity);
    }

    @Transactional
    public PersonalizedOfferDto createOffer(Long guestId, Long campaignId, String reason,
                                            LocalDateTime validFrom, LocalDateTime validTo) {
        PersonalizedOffer offer = new PersonalizedOffer();
        offer.setGuest(guestRepository.findById(guestId)
            .orElseThrow(() -> new ResourceNotFoundException("Guest not found")));
        offer.setCampaign(campaignRepository.findById(campaignId)
            .orElseThrow(() -> new ResourceNotFoundException("Campaign not found")));
        offer.setReason(reason);
        offer.setStatus(OfferStatus.PENDING);
        offer.setValidFrom(validFrom);
        offer.setValidTo(validTo);
        PersonalizedOffer saved = offerRepository.save(offer);
        log.info("Created personalized offer id={} for guest={}", saved.getId(), guestId);
        return PersonalizedOfferDto.fromEntity(saved);
    }

    @Transactional
    public PersonalizedOfferDto redeemOffer(Long offerId) {
        PersonalizedOffer offer = offerRepository.findById(offerId)
            .orElseThrow(() -> new ResourceNotFoundException("Offer not found"));
        if (offer.getStatus() != OfferStatus.PENDING && offer.getStatus() != OfferStatus.SENT) {
            throw new com.restaurant.exception.BusinessException("Offer cannot be redeemed in status: " + offer.getStatus());
        }
        if (offer.getValidTo() != null && offer.getValidTo().isBefore(LocalDateTime.now())) {
            offer.setStatus(OfferStatus.EXPIRED);
            offerRepository.save(offer);
            throw new com.restaurant.exception.BusinessException("Offer has expired");
        }
        offer.setStatus(OfferStatus.REDEEMED);
        PersonalizedOffer saved = offerRepository.save(offer);
        log.info("Redeemed offer id={}", offerId);
        return PersonalizedOfferDto.fromEntity(saved);
    }

    @Transactional(readOnly = true)
    public List<PersonalizedOfferDto> getActiveOffers(Long guestId) {
        List<PersonalizedOffer> pending = offerRepository.findByGuestIdAndStatus(guestId, OfferStatus.PENDING);
        List<PersonalizedOffer> sent = offerRepository.findByGuestIdAndStatus(guestId, OfferStatus.SENT);
        return java.util.stream.Stream.concat(pending.stream(), sent.stream())
            .map(PersonalizedOfferDto::fromEntity).toList();
    }
}
