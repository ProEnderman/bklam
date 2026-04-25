package com.restaurant.service.loyalty;

import com.restaurant.dto.loyalty.TierDto;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.loyalty.GuestTierHistory;
import com.restaurant.model.loyalty.Tier;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.loyalty.BonusLedgerEntryRepository;
import com.restaurant.repository.loyalty.BonusAccountRepository;
import com.restaurant.repository.loyalty.GuestRepository;
import com.restaurant.repository.loyalty.GuestTierHistoryRepository;
import com.restaurant.repository.loyalty.TierRepository;
import com.restaurant.model.loyalty.LedgerEntryType;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class TierService {

    private final TierRepository tierRepository;
    private final GuestTierHistoryRepository tierHistoryRepository;
    private final BonusAccountRepository bonusAccountRepository;
    private final BonusLedgerEntryRepository ledgerRepository;
    private final GuestRepository guestRepository;
    private final RestaurantRepository restaurantRepository;

    private Long getRestaurantId() {
        return SecurityUtils.getCurrentRestaurantId();
    }

    @Transactional(readOnly = true)
    public List<TierDto> getAllTiers() {
        return tierRepository.findByRestaurantIdOrderByLevelAsc(getRestaurantId())
            .stream().map(TierDto::fromEntity).toList();
    }

    @Transactional
    public TierDto createTier(TierDto req) {
        Long rid = getRestaurantId();
        Tier tier = new Tier();
        tier.setRestaurant(restaurantRepository.findById(rid)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        tier.setName(req.name());
        tier.setLevel(req.level() != null ? req.level() : 0);
        tier.setThreshold(req.threshold() != null ? req.threshold() : BigDecimal.ZERO);
        tier.setCashbackPercent(req.cashbackPercent() != null ? req.cashbackPercent() : BigDecimal.ZERO);
        tier.setBenefits(req.benefits() != null ? req.benefits() : "{}");
        tier.setValidFrom(req.validFrom());
        tier.setValidTo(req.validTo());
        Tier saved = tierRepository.save(tier);
        log.info("Created tier id={}, name={}", saved.getId(), saved.getName());
        return TierDto.fromEntity(saved);
    }

    @Transactional
    public TierDto updateTier(Long id, TierDto req) {
        Tier tier = tierRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Tier not found: " + id));
        if (req.name() != null) tier.setName(req.name());
        if (req.level() != null) tier.setLevel(req.level());
        if (req.threshold() != null) tier.setThreshold(req.threshold());
        if (req.cashbackPercent() != null) tier.setCashbackPercent(req.cashbackPercent());
        if (req.benefits() != null) tier.setBenefits(req.benefits());
        if (req.validFrom() != null) tier.setValidFrom(req.validFrom());
        if (req.validTo() != null) tier.setValidTo(req.validTo());
        Tier saved = tierRepository.save(tier);
        return TierDto.fromEntity(saved);
    }

    @Transactional
    public void deleteTier(Long id) {
        tierRepository.deleteById(id);
    }

    /**
     * Evaluate and assign tier for a guest based on total earned points.
     */
    @Transactional
    public TierDto evaluateGuestTier(Long guestId) {
        Long rid = guestRepository.findById(guestId)
            .orElseThrow(() -> new ResourceNotFoundException("Guest not found"))
            .getRestaurantId();

        // Total earned
        var account = bonusAccountRepository.findByGuestId(guestId).orElse(null);
        if (account == null) return null;

        BigDecimal totalEarned = ledgerRepository.sumByType(account.getId(), LedgerEntryType.EARN);

        List<Tier> tiers = tierRepository.findByRestaurantIdOrderByLevelAsc(rid);
        Tier bestTier = null;
        for (Tier t : tiers) {
            if (totalEarned.compareTo(t.getThreshold()) >= 0) {
                bestTier = t;
            }
        }

        if (bestTier == null) return null;

        // Check if already at this tier
        var current = tierHistoryRepository.findCurrentTier(guestId);
        if (current.isPresent() && current.get().getTier().getId().equals(bestTier.getId())) {
            return TierDto.fromEntity(bestTier);
        }

        // Assign new tier
        GuestTierHistory history = new GuestTierHistory();
        history.setGuest(guestRepository.findById(guestId).orElseThrow());
        history.setTier(bestTier);
        history.setReason("Auto-evaluated: total earned = " + totalEarned);
        tierHistoryRepository.save(history);

        log.info("Assigned tier '{}' to guest {}", bestTier.getName(), guestId);
        return TierDto.fromEntity(bestTier);
    }

    @Transactional(readOnly = true)
    public TierDto getCurrentTier(Long guestId) {
        return tierHistoryRepository.findCurrentTier(guestId)
            .map(h -> TierDto.fromEntity(h.getTier()))
            .orElse(null);
    }
}
