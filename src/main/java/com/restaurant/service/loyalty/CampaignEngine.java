package com.restaurant.service.loyalty;

import com.restaurant.dto.loyalty.BonusTransactionRequest;
import com.restaurant.model.loyalty.*;
import com.restaurant.repository.loyalty.CampaignRepository;
import com.restaurant.repository.loyalty.GuestRepository;
import com.restaurant.repository.loyalty.GuestTierHistoryRepository;
import com.restaurant.repository.loyalty.TierRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Evaluates active campaigns and awards points for a given event (e.g., order closed).
 * Idempotent: uses order_id-based keys.
 */
@Slf4j
@Service
public class CampaignEngine {

    private final CampaignRepository campaignRepository;
    private final BonusAccountService bonusAccountService;
    private final TierService tierService;
    private final GuestRepository guestRepository;
    private final GuestTierHistoryRepository tierHistoryRepository;
    private final TierRepository tierRepository;
    private final ObjectMapper objectMapper;
    private final GamificationService gamificationService;

    public CampaignEngine(
            CampaignRepository campaignRepository,
            BonusAccountService bonusAccountService,
            TierService tierService,
            GuestRepository guestRepository,
            GuestTierHistoryRepository tierHistoryRepository,
            TierRepository tierRepository,
            ObjectMapper objectMapper,
            @Lazy GamificationService gamificationService) {
        this.campaignRepository = campaignRepository;
        this.bonusAccountService = bonusAccountService;
        this.tierService = tierService;
        this.guestRepository = guestRepository;
        this.tierHistoryRepository = tierHistoryRepository;
        this.tierRepository = tierRepository;
        this.objectMapper = objectMapper;
        this.gamificationService = gamificationService;
    }

    /**
     * Process an order event: evaluate all active campaigns and earn points.
     *
     * @param guestId      the guest
     * @param orderId      the order that triggered the event
     * @param orderAmount  the order total
     * @param restaurantId the restaurant
     */
    @Transactional
    public void processOrderEvent(Long guestId, Long orderId, BigDecimal orderAmount, Long restaurantId) {
        List<Campaign> activeCampaigns = campaignRepository.findActiveCampaigns(restaurantId, LocalDateTime.now())
            .stream()
            .filter(c -> extractScopeFromRules(c.getRules()) == LoyaltyScope.RESTAURANT)
            .toList();
        Guest guest = guestRepository.findById(guestId).orElse(null);
        if (guest == null) return;

        BigDecimal totalPoints = BigDecimal.ZERO;

        for (Campaign campaign : activeCampaigns) {
            BigDecimal earned = evaluateCampaign(campaign, guest, orderAmount);
            if (earned.compareTo(BigDecimal.ZERO) > 0) {
                String key = "order-" + orderId + "-campaign-" + campaign.getId();
                try {
                    bonusAccountService.earnPoints(new BonusTransactionRequest(
                        guestId, earned, "CAMPAIGN", campaign.getId().toString(),
                        campaign.getName() + ": +" + earned + " points",
                        key
                    ));
                    totalPoints = totalPoints.add(earned);
                } catch (Exception e) {
                    log.warn("Campaign {} already processed for order {}: {}", campaign.getId(), orderId, e.getMessage());
                }
            }
        }

        if (totalPoints.compareTo(BigDecimal.ZERO) > 0) {
            log.info("Order {} for guest {}: total {} points from {} campaigns", orderId, guestId, totalPoints, activeCampaigns.size());
            tierService.evaluateGuestTier(guestId);
        }

        // Advance mission progress
        try {
            gamificationService.updateMissionProgress(guestId, MissionType.PURCHASE_COUNT, BigDecimal.ONE);
            gamificationService.updateMissionProgress(guestId, MissionType.SPEND_AMOUNT, orderAmount);
        } catch (Exception e) {
            log.warn("Mission progress update failed for guest {}: {}", guestId, e.getMessage());
        }
    }

    private BigDecimal evaluateCampaign(Campaign campaign, Guest guest, BigDecimal orderAmount) {
        return switch (campaign.getCampaignType()) {
            case CASHBACK -> {
                // rules: {"percent": 5}
                BigDecimal percent = extractPercent(campaign.getRules());
                // Apply tier multiplier if any
                BigDecimal tierMultiplier = getTierCashbackMultiplier(guest.getId());
                BigDecimal base = orderAmount.multiply(percent).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
                yield base.multiply(tierMultiplier).setScale(2, RoundingMode.HALF_UP);
            }
            case MULTIPLIER -> {
                // rules: {"multiplier": 2, "basePercent": 5}
                BigDecimal multiplier = extractMultiplier(campaign.getRules());
                BigDecimal basePercent = extractJsonBigDecimal(campaign.getRules(), "basePercent", BigDecimal.valueOf(5));
                yield orderAmount.multiply(basePercent).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
                    .multiply(multiplier).setScale(2, RoundingMode.HALF_UP);
            }
            case BIRTHDAY -> {
                if (guest.getBirthday() != null) {
                    LocalDate today = LocalDate.now();
                    if (today.getMonth() == guest.getBirthday().getMonth()
                        && today.getDayOfMonth() == guest.getBirthday().getDayOfMonth()) {
                        BigDecimal bonus = extractJsonBigDecimal(campaign.getRules(), "bonusPoints", BigDecimal.valueOf(100));
                        yield bonus;
                    }
                }
                yield BigDecimal.ZERO;
            }
            case WELCOME -> {
                // Already handled at registration; skip for order events
                yield BigDecimal.ZERO;
            }
            case WINBACK, REFERRAL, CATEGORY_BONUS -> {
                // Simplified: use a flat bonus from rules
                yield extractJsonBigDecimal(campaign.getRules(), "bonusPoints", BigDecimal.ZERO);
            }
        };
    }

    private BigDecimal getTierCashbackMultiplier(Long guestId) {
        return tierHistoryRepository.findCurrentTier(guestId)
            .map(h -> {
                BigDecimal cb = h.getTier().getCashbackPercent();
                return cb.compareTo(BigDecimal.ZERO) > 0
                    ? BigDecimal.ONE.add(cb.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP))
                    : BigDecimal.ONE;
            }).orElse(BigDecimal.ONE);
    }

    // Simple JSON field extraction (no Jackson dependency in hot path)
    private BigDecimal extractPercent(String rules) {
        return extractJsonBigDecimal(rules, "percent", BigDecimal.valueOf(5));
    }

    private BigDecimal extractMultiplier(String rules) {
        return extractJsonBigDecimal(rules, "multiplier", BigDecimal.valueOf(2));
    }

    private BigDecimal extractJsonBigDecimal(String json, String field, BigDecimal defaultVal) {
        if (json == null) return defaultVal;
        try {
            // Minimal regex extraction for {"field": value}
            String pattern = "\"" + field + "\"\\s*:\\s*([\\d.]+)";
            var matcher = java.util.regex.Pattern.compile(pattern).matcher(json);
            if (matcher.find()) {
                return new BigDecimal(matcher.group(1));
            }
        } catch (Exception e) {
            log.warn("Failed to parse {} from rules: {}", field, e.getMessage());
        }
        return defaultVal;
    }

    private LoyaltyScope extractScopeFromRules(String rulesJson) {
        try {
            Map<String, Object> m = objectMapper.readValue(
                rulesJson != null ? rulesJson : "{}",
                new TypeReference<Map<String, Object>>() {}
            );
            Object raw = m.get("scope");
            if (raw == null) return LoyaltyScope.RESTAURANT;
            return LoyaltyScope.valueOf(String.valueOf(raw).trim().toUpperCase());
        } catch (Exception e) {
            return LoyaltyScope.RESTAURANT;
        }
    }
}
