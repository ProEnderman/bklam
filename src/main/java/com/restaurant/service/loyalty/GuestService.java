package com.restaurant.service.loyalty;

import com.restaurant.dto.loyalty.*;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.loyalty.*;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.loyalty.*;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class GuestService {

    private final GuestRepository guestRepository;
    private final GuestAliasRepository guestAliasRepository;
    private final BonusAccountRepository bonusAccountRepository;
    private final BonusLedgerEntryRepository ledgerRepository;
    private final GuestTierHistoryRepository tierHistoryRepository;
    private final MissionProgressRepository missionProgressRepository;
    private final GuestAchievementRepository guestAchievementRepository;
    private final AchievementRepository achievementRepository;
    private final RfmSnapshotRepository rfmSnapshotRepository;
    private final TierRepository tierRepository;
    private final RestaurantRepository restaurantRepository;
    private final PhoneNormalizer phoneNormalizer;

    private Long getRestaurantId() {
        return SecurityUtils.getCurrentRestaurantId();
    }

    // ── Search / lookup by phone ──────────────────────────────────────

    @Transactional(readOnly = true)
    public GuestDto findByPhone(String rawPhone) {
        String phone = phoneNormalizer.normalize(rawPhone);
        Long rid = getRestaurantId();

        // Direct match
        var opt = guestRepository.findByRestaurantIdAndPhoneNormalized(rid, phone);
        if (opt.isPresent()) return GuestDto.fromEntity(opt.get());

        // Alias match
        var alias = guestAliasRepository.findByAliasPhone(phone);
        if (alias.isPresent()) {
            Guest primary = alias.get().getPrimaryGuest();
            if (primary.getRestaurantId().equals(rid)) {
                return GuestDto.fromEntity(primary);
            }
        }

        return null; // not found
    }

    @Transactional(readOnly = true)
    public Page<GuestDto> searchGuests(String query, Pageable pageable) {
        Long rid = getRestaurantId();
        if (query != null && !query.isBlank()) {
            return guestRepository.searchGuests(rid, query.trim(), pageable).map(GuestDto::fromEntity);
        }
        return guestRepository.findByRestaurantId(rid, pageable).map(GuestDto::fromEntity);
    }

    @Transactional(readOnly = true)
    public GuestDto getById(Long id) {
        Guest g = guestRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Guest not found: " + id));
        return GuestDto.fromEntity(g);
    }

    // ── Create ────────────────────────────────────────────────────────

    @Transactional
    public GuestDto createGuest(CreateGuestRequest req) {
        Long rid = getRestaurantId();
        String phone = phoneNormalizer.normalize(req.phone());

        // Check duplicate
        if (guestRepository.findByRestaurantIdAndPhoneNormalized(rid, phone).isPresent()) {
            throw new BusinessException("Guest with this phone already exists");
        }

        Guest g = new Guest();
        g.setRestaurant(restaurantRepository.findById(rid)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        g.setPhoneNormalized(phone);
        g.setName(req.name());
        g.setEmail(req.email());
        g.setBirthday(req.birthday());
        Guest saved = guestRepository.save(g);

        // Create bonus account automatically
        BonusAccount account = new BonusAccount();
        account.setGuest(saved);
        account.setStatus(BonusAccountStatus.ACTIVE);
        account.setCurrentBalance(BigDecimal.ZERO);
        bonusAccountRepository.save(account);

        log.info("Created loyalty guest id={}, phone={}", saved.getId(), phone);
        return GuestDto.fromEntity(saved);
    }

    // ── Update ────────────────────────────────────────────────────────

    @Transactional
    public GuestDto updateGuest(Long id, UpdateGuestRequest req) {
        Guest g = guestRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Guest not found: " + id));
        if (req.name() != null) g.setName(req.name());
        if (req.email() != null) g.setEmail(req.email());
        if (req.birthday() != null) g.setBirthday(req.birthday());
        Guest saved = guestRepository.save(g);
        log.info("Updated loyalty guest id={}", id);
        return GuestDto.fromEntity(saved);
    }

    // ── Soft merge ────────────────────────────────────────────────────

    @Transactional
    public GuestDto mergeGuests(GuestMergeRequest req) {
        Guest source = guestRepository.findById(req.sourceGuestId())
            .orElseThrow(() -> new ResourceNotFoundException("Source guest not found"));
        Guest target = guestRepository.findById(req.targetGuestId())
            .orElseThrow(() -> new ResourceNotFoundException("Target guest not found"));

        if (source.getId().equals(target.getId())) {
            throw new BusinessException("Cannot merge guest with itself");
        }
        if (!source.getRestaurantId().equals(target.getRestaurantId())) {
            throw new BusinessException("Cannot merge guests from different restaurants");
        }

        // Create alias: source phone → target
        GuestAlias alias = new GuestAlias();
        alias.setPrimaryGuest(target);
        alias.setAliasPhone(source.getPhoneNormalized());
        guestAliasRepository.save(alias);

        // Transfer bonus balance
        var srcAccount = bonusAccountRepository.findByGuestId(source.getId());
        var tgtAccount = bonusAccountRepository.findByGuestId(target.getId());
        if (srcAccount.isPresent() && tgtAccount.isPresent()) {
            BigDecimal transferAmount = srcAccount.get().getCurrentBalance();
            if (transferAmount.compareTo(BigDecimal.ZERO) > 0) {
                // Debit source
                BonusLedgerEntry debit = new BonusLedgerEntry();
                debit.setAccount(srcAccount.get());
                debit.setEntryType(LedgerEntryType.ADJUST);
                debit.setAmount(transferAmount.negate());
                debit.setSourceType("MERGE");
                debit.setSourceId(target.getId().toString());
                debit.setDescription("Merge transfer to guest #" + target.getId());
                debit.setIdempotencyKey("merge-debit-" + source.getId() + "-" + target.getId());
                ledgerRepository.save(debit);

                // Credit target
                BonusLedgerEntry credit = new BonusLedgerEntry();
                credit.setAccount(tgtAccount.get());
                credit.setEntryType(LedgerEntryType.ADJUST);
                credit.setAmount(transferAmount);
                credit.setSourceType("MERGE");
                credit.setSourceId(source.getId().toString());
                credit.setDescription("Merge from guest #" + source.getId());
                credit.setIdempotencyKey("merge-credit-" + source.getId() + "-" + target.getId());
                ledgerRepository.save(credit);

                tgtAccount.get().setCurrentBalance(tgtAccount.get().getCurrentBalance().add(transferAmount));
                bonusAccountRepository.save(tgtAccount.get());
            }
            // Zero out source
            srcAccount.get().setCurrentBalance(BigDecimal.ZERO);
            srcAccount.get().setStatus(BonusAccountStatus.CLOSED);
            bonusAccountRepository.save(srcAccount.get());
        }

        log.info("Merged guest {} → {}", source.getId(), target.getId());
        return GuestDto.fromEntity(target);
    }

    // ── Full profile ──────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public GuestProfileDto getProfile(Long guestId) {
        Guest g = guestRepository.findById(guestId)
            .orElseThrow(() -> new ResourceNotFoundException("Guest not found: " + guestId));

        GuestDto guestDto = GuestDto.fromEntity(g);

        // Bonus
        BonusAccountDto bonusDto = bonusAccountRepository.findByGuestId(guestId)
            .map(a -> {
                BigDecimal earned = ledgerRepository.sumByType(a.getId(), LedgerEntryType.EARN);
                BigDecimal burned = ledgerRepository.sumByType(a.getId(), LedgerEntryType.BURN);
                return BonusAccountDto.fromEntity(a, earned, burned);
            }).orElse(null);

        // Current tier
        TierDto tierDto = tierHistoryRepository.findCurrentTier(guestId)
            .map(h -> TierDto.fromEntity(h.getTier()))
            .orElse(null);

        // Active missions
        List<MissionProgressDto> missions = missionProgressRepository.findByGuestIdAndStatus(guestId, MissionProgressStatus.IN_PROGRESS)
            .stream().map(MissionProgressDto::fromEntity).toList();

        // Achievements
        List<AchievementDto> achievements = guestAchievementRepository.findByGuestId(guestId)
            .stream().map(ga -> AchievementDto.fromEntity(ga.getAchievement())).toList();

        // RFM
        RfmSnapshotDto rfm = rfmSnapshotRepository.findLatestByGuestId(guestId)
            .map(RfmSnapshotDto::fromEntity).orElse(null);

        return new GuestProfileDto(guestDto, bonusDto, tierDto, missions, achievements, rfm);
    }

    @Transactional(readOnly = true)
    public long countGuests() {
        return guestRepository.countByRestaurantId(getRestaurantId());
    }
}
