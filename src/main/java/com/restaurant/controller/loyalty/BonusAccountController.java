package com.restaurant.controller.loyalty;

import com.restaurant.dto.loyalty.BonusAccountDto;
import com.restaurant.dto.loyalty.BonusLedgerEntryDto;
import com.restaurant.dto.loyalty.BonusTransactionRequest;
import com.restaurant.service.loyalty.BonusAccountService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@Tag(name = "Loyalty - Bonus", description = "Bonus account, earn/burn/history")
@RestController
@RequestMapping("/api/loyalty/bonus")
@RequiredArgsConstructor
public class BonusAccountController {

    private final BonusAccountService bonusAccountService;

    @Operation(summary = "Get bonus account for a guest")
    @GetMapping("/{guestId}")
    public ResponseEntity<BonusAccountDto> getAccount(@PathVariable Long guestId) {
        return ResponseEntity.ok(bonusAccountService.getAccount(guestId));
    }

    @Operation(summary = "Earn (accrue) points — idempotent via idempotencyKey")
    @PostMapping("/earn")
    public ResponseEntity<BonusLedgerEntryDto> earnPoints(@Valid @RequestBody BonusTransactionRequest request) {
        return ResponseEntity.ok(bonusAccountService.earnPoints(request));
    }

    @Operation(summary = "Burn (redeem) points — checks balance")
    @PostMapping("/burn")
    public ResponseEntity<BonusLedgerEntryDto> burnPoints(@Valid @RequestBody BonusTransactionRequest request) {
        return ResponseEntity.ok(bonusAccountService.burnPoints(request));
    }

    @Operation(summary = "Manual balance adjustment")
    @PostMapping("/{guestId}/adjust")
    public ResponseEntity<BonusLedgerEntryDto> adjust(
        @PathVariable Long guestId,
        @RequestParam BigDecimal amount,
        @RequestParam(required = false) String reason
    ) {
        return ResponseEntity.ok(bonusAccountService.adjustBalance(guestId, amount, reason));
    }

    @Operation(summary = "Get transaction history for a guest")
    @GetMapping("/{guestId}/history")
    public ResponseEntity<Page<BonusLedgerEntryDto>> getHistory(
        @PathVariable Long guestId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(bonusAccountService.getHistory(guestId, PageRequest.of(page, size)));
    }

    @Operation(summary = "Reconcile cached balance from ledger")
    @PostMapping("/{guestId}/reconcile")
    public ResponseEntity<BonusAccountDto> reconcile(@PathVariable Long guestId) {
        return ResponseEntity.ok(bonusAccountService.reconcileBalance(guestId));
    }
}
