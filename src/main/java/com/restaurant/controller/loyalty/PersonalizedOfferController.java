package com.restaurant.controller.loyalty;

import com.restaurant.dto.loyalty.PersonalizedOfferDto;
import com.restaurant.service.loyalty.PersonalizedOfferService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@Tag(name = "Loyalty - Offers", description = "Personalized offers & targeting")
@RestController
@RequestMapping("/api/loyalty/offers")
@RequiredArgsConstructor
public class PersonalizedOfferController {

    private final PersonalizedOfferService offerService;

    @Operation(summary = "Get offers for a guest (paged)")
    @GetMapping("/guest/{guestId}")
    public ResponseEntity<Page<PersonalizedOfferDto>> getGuestOffers(
        @PathVariable Long guestId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(offerService.getGuestOffers(guestId, PageRequest.of(page, size)));
    }

    @Operation(summary = "Get active (pending) offers for a guest")
    @GetMapping("/guest/{guestId}/active")
    public ResponseEntity<List<PersonalizedOfferDto>> getActiveOffers(@PathVariable Long guestId) {
        return ResponseEntity.ok(offerService.getActiveOffers(guestId));
    }

    @Operation(summary = "Create a personalized offer")
    @PostMapping
    public ResponseEntity<PersonalizedOfferDto> createOffer(
        @RequestParam Long guestId,
        @RequestParam Long campaignId,
        @RequestParam(required = false) String reason,
        @RequestParam(required = false) LocalDateTime validFrom,
        @RequestParam(required = false) LocalDateTime validTo
    ) {
        return ResponseEntity.ok(offerService.createOffer(guestId, campaignId, reason, validFrom, validTo));
    }

    @Operation(summary = "Redeem an offer")
    @PostMapping("/{offerId}/redeem")
    public ResponseEntity<PersonalizedOfferDto> redeemOffer(@PathVariable Long offerId) {
        return ResponseEntity.ok(offerService.redeemOffer(offerId));
    }
}
