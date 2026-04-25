package com.restaurant.service.loyalty;

import com.restaurant.audit.AuditActions;
import com.restaurant.audit.StructuredAudit;
import com.restaurant.observability.BusinessMetrics;
import com.restaurant.dto.loyalty.BonusAccountDto;
import com.restaurant.dto.loyalty.BonusLedgerEntryDto;
import com.restaurant.dto.loyalty.BonusTransactionRequest;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.loyalty.*;
import com.restaurant.repository.loyalty.BonusAccountRepository;
import com.restaurant.repository.loyalty.BonusLedgerEntryRepository;
import com.restaurant.repository.loyalty.GuestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class BonusAccountService {

    private final BusinessMetrics businessMetrics;
    private final BonusAccountRepository accountRepository;
    private final BonusLedgerEntryRepository ledgerRepository;
    private final GuestRepository guestRepository;

    // ── Get account ───────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public BonusAccountDto getAccount(Long guestId) {
        BonusAccount account = accountRepository.findByGuestId(guestId)
            .orElseThrow(() -> new ResourceNotFoundException("Bonus account not found for guest: " + guestId));
        BigDecimal earned = ledgerRepository.sumByType(account.getId(), LedgerEntryType.EARN);
        BigDecimal burned = ledgerRepository.sumByType(account.getId(), LedgerEntryType.BURN);
        return BonusAccountDto.fromEntity(account, earned, burned);
    }

    // ── Earn points (idempotent by idempotencyKey) ────────────────────

    @Transactional
    public BonusLedgerEntryDto earnPoints(BonusTransactionRequest req) {
        // Idempotency check
        if (req.idempotencyKey() != null && ledgerRepository.existsByIdempotencyKey(req.idempotencyKey())) {
            log.warn("Duplicate earn request with key={}", req.idempotencyKey());
            businessMetrics.incrementLoyaltyIdempotentHit();
            return BonusLedgerEntryDto.fromEntity(
                ledgerRepository.findByIdempotencyKey(req.idempotencyKey()).orElseThrow());
        }

        BonusAccount account = getOrCreateAccount(req.guestId());
        validateAccountActive(account);

        BonusLedgerEntry entry = new BonusLedgerEntry();
        entry.setAccount(account);
        entry.setEntryType(LedgerEntryType.EARN);
        entry.setAmount(req.amount());
        entry.setSourceType(req.sourceType());
        entry.setSourceId(req.sourceId());
        entry.setDescription(req.description());
        entry.setIdempotencyKey(req.idempotencyKey());
        BonusLedgerEntry saved;
        try {
            saved = ledgerRepository.save(entry);
        } catch (DataIntegrityViolationException ex) {
            if (req.idempotencyKey() != null) {
                log.warn("Earn idempotency race for key={}, returning existing", req.idempotencyKey());
                businessMetrics.incrementLoyaltyIdempotentHit();
                return BonusLedgerEntryDto.fromEntity(
                    ledgerRepository.findByIdempotencyKey(req.idempotencyKey()).orElseThrow());
            }
            throw ex;
        }

        // Update cached balance
        account.setCurrentBalance(account.getCurrentBalance().add(req.amount()));
        accountRepository.save(account);

        businessMetrics.incrementLoyaltyOperation("earn");
        log.info("Earned {} points for guest {}, key={}", req.amount(), req.guestId(), req.idempotencyKey());
        try {
            HashMap<String, Object> audit = new HashMap<>();
            audit.put("guestId", req.guestId());
            audit.put("entityType", "LOYALTY_LEDGER");
            audit.put("entityId", saved.getId());
            audit.put("amount", req.amount().toPlainString());
            guestRepository.findById(req.guestId()).ifPresent(g -> {
                if (g.getRestaurant() != null) {
                    audit.put("restaurantId", g.getRestaurant().getId());
                }
            });
            StructuredAudit.success(AuditActions.LOYALTY_POINTS_EARNED, audit);
        } catch (RuntimeException ignored) {
        }
        return BonusLedgerEntryDto.fromEntity(saved);
    }

    // ── Burn points (with balance check) ──────────────────────────────

    @Transactional
    public BonusLedgerEntryDto burnPoints(BonusTransactionRequest req) {
        // Idempotency check
        if (req.idempotencyKey() != null && ledgerRepository.existsByIdempotencyKey(req.idempotencyKey())) {
            log.warn("Duplicate burn request with key={}", req.idempotencyKey());
            businessMetrics.incrementLoyaltyIdempotentHit();
            return BonusLedgerEntryDto.fromEntity(
                ledgerRepository.findByIdempotencyKey(req.idempotencyKey()).orElseThrow());
        }

        BonusAccount account = accountRepository.findByGuestId(req.guestId())
            .orElseThrow(() -> new ResourceNotFoundException("Bonus account not found for guest: " + req.guestId()));
        validateAccountActive(account);

        // Balance check — crucial invariant
        if (account.getCurrentBalance().compareTo(req.amount()) < 0) {
            try {
                HashMap<String, Object> audit = new HashMap<>();
                audit.put("guestId", req.guestId());
                audit.put("reason", "INSUFFICIENT_BALANCE");
                audit.put("requestedAmount", req.amount().toPlainString());
                guestRepository.findById(req.guestId()).ifPresent(g -> {
                    if (g.getRestaurant() != null) {
                        audit.put("restaurantId", g.getRestaurant().getId());
                    }
                });
                StructuredAudit.failure(AuditActions.LOYALTY_BURN_DENIED, audit);
            } catch (RuntimeException ignored) {
            }
            throw new BusinessException(
                String.format("Insufficient balance: available=%.2f, requested=%.2f",
                    account.getCurrentBalance(), req.amount()));
        }

        BonusLedgerEntry entry = new BonusLedgerEntry();
        entry.setAccount(account);
        entry.setEntryType(LedgerEntryType.BURN);
        entry.setAmount(req.amount());
        entry.setSourceType(req.sourceType());
        entry.setSourceId(req.sourceId());
        entry.setDescription(req.description());
        entry.setIdempotencyKey(req.idempotencyKey());
        BonusLedgerEntry saved;
        try {
            saved = ledgerRepository.save(entry);
        } catch (DataIntegrityViolationException ex) {
            if (req.idempotencyKey() != null) {
                log.warn("Burn idempotency race for key={}, returning existing", req.idempotencyKey());
                businessMetrics.incrementLoyaltyIdempotentHit();
                return BonusLedgerEntryDto.fromEntity(
                    ledgerRepository.findByIdempotencyKey(req.idempotencyKey()).orElseThrow());
            }
            throw ex;
        }

        // Update cached balance
        account.setCurrentBalance(account.getCurrentBalance().subtract(req.amount()));
        accountRepository.save(account);

        businessMetrics.incrementLoyaltyOperation("burn");
        log.info("Burned {} points for guest {}, key={}", req.amount(), req.guestId(), req.idempotencyKey());
        try {
            HashMap<String, Object> audit = new HashMap<>();
            audit.put("guestId", req.guestId());
            audit.put("entityType", "LOYALTY_LEDGER");
            audit.put("entityId", saved.getId());
            audit.put("amount", req.amount().toPlainString());
            guestRepository.findById(req.guestId()).ifPresent(g -> {
                if (g.getRestaurant() != null) {
                    audit.put("restaurantId", g.getRestaurant().getId());
                }
            });
            StructuredAudit.success(AuditActions.LOYALTY_POINTS_BURNED, audit);
        } catch (RuntimeException ignored) {
        }
        return BonusLedgerEntryDto.fromEntity(saved);
    }

    // ── Expire points ─────────────────────────────────────────────────

    @Transactional
    public BonusLedgerEntryDto expirePoints(Long guestId, BigDecimal amount, String reason) {
        BonusAccount account = accountRepository.findByGuestId(guestId)
            .orElseThrow(() -> new ResourceNotFoundException("Bonus account not found for guest: " + guestId));

        BigDecimal toExpire = amount.min(account.getCurrentBalance());
        if (toExpire.compareTo(BigDecimal.ZERO) <= 0) return null;

        BonusLedgerEntry entry = new BonusLedgerEntry();
        entry.setAccount(account);
        entry.setEntryType(LedgerEntryType.EXPIRE);
        entry.setAmount(toExpire);
        entry.setSourceType("SYSTEM");
        entry.setDescription(reason != null ? reason : "Points expired");
        entry.setIdempotencyKey("expire-" + guestId + "-" + System.currentTimeMillis());
        BonusLedgerEntry saved = ledgerRepository.save(entry);

        account.setCurrentBalance(account.getCurrentBalance().subtract(toExpire));
        accountRepository.save(account);

        log.info("Expired {} points for guest {}", toExpire, guestId);
        return BonusLedgerEntryDto.fromEntity(saved);
    }

    // ── Manual adjust ─────────────────────────────────────────────────

    @Transactional
    public BonusLedgerEntryDto adjustBalance(Long guestId, BigDecimal amount, String reason) {
        BonusAccount account = getOrCreateAccount(guestId);

        BonusLedgerEntry entry = new BonusLedgerEntry();
        entry.setAccount(account);
        entry.setEntryType(LedgerEntryType.ADJUST);
        entry.setAmount(amount);
        entry.setSourceType("MANUAL");
        entry.setDescription(reason);
        entry.setIdempotencyKey("adjust-" + guestId + "-" + System.currentTimeMillis());
        BonusLedgerEntry saved = ledgerRepository.save(entry);

        account.setCurrentBalance(account.getCurrentBalance().add(amount));
        accountRepository.save(account);

        log.info("Adjusted {} points for guest {}, reason={}", amount, guestId, reason);
        return BonusLedgerEntryDto.fromEntity(saved);
    }

    // ── History ───────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Page<BonusLedgerEntryDto> getHistory(Long guestId, Pageable pageable) {
        BonusAccount account = accountRepository.findByGuestId(guestId)
            .orElseThrow(() -> new ResourceNotFoundException("Bonus account not found for guest: " + guestId));
        return ledgerRepository.findByAccountIdOrderByCreatedAtDesc(account.getId(), pageable)
            .map(BonusLedgerEntryDto::fromEntity);
    }

    // ── Reconcile (recompute cached balance from ledger) ──────────────

    @Transactional
    public BonusAccountDto reconcileBalance(Long guestId) {
        BonusAccount account = accountRepository.findByGuestId(guestId)
            .orElseThrow(() -> new ResourceNotFoundException("Bonus account not found for guest: " + guestId));
        BigDecimal computed = ledgerRepository.computeBalance(account.getId());
        account.setCurrentBalance(computed);
        accountRepository.save(account);
        BigDecimal earned = ledgerRepository.sumByType(account.getId(), LedgerEntryType.EARN);
        BigDecimal burned = ledgerRepository.sumByType(account.getId(), LedgerEntryType.BURN);
        log.info("Reconciled balance for guest {}: {}", guestId, computed);
        return BonusAccountDto.fromEntity(account, earned, burned);
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private BonusAccount getOrCreateAccount(Long guestId) {
        return accountRepository.findByGuestId(guestId).orElseGet(() -> {
            Guest guest = guestRepository.findById(guestId)
                .orElseThrow(() -> new ResourceNotFoundException("Guest not found: " + guestId));
            BonusAccount a = new BonusAccount();
            a.setGuest(guest);
            a.setStatus(BonusAccountStatus.ACTIVE);
            a.setCurrentBalance(BigDecimal.ZERO);
            return accountRepository.save(a);
        });
    }

    private void validateAccountActive(BonusAccount account) {
        if (account.getStatus() != BonusAccountStatus.ACTIVE) {
            throw new BusinessException("Bonus account is " + account.getStatus());
        }
    }
}
