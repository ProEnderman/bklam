package com.restaurant.controller.loyalty;

import com.restaurant.dto.loyalty.TierDto;
import com.restaurant.service.loyalty.TierService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Loyalty - Tiers", description = "Tier/level management")
@RestController
@RequestMapping("/api/loyalty/tiers")
@RequiredArgsConstructor
public class TierController {

    private final TierService tierService;

    @Operation(summary = "Get all tiers for the restaurant")
    @GetMapping
    public ResponseEntity<List<TierDto>> getAllTiers() {
        return ResponseEntity.ok(tierService.getAllTiers());
    }

    @Operation(summary = "Create a new tier")
    @PostMapping
    public ResponseEntity<TierDto> createTier(@RequestBody TierDto request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(tierService.createTier(request));
    }

    @Operation(summary = "Update a tier")
    @PutMapping("/{id}")
    public ResponseEntity<TierDto> updateTier(@PathVariable Long id, @RequestBody TierDto request) {
        return ResponseEntity.ok(tierService.updateTier(id, request));
    }

    @Operation(summary = "Delete a tier")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTier(@PathVariable Long id) {
        tierService.deleteTier(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Evaluate and assign tier for a guest")
    @PostMapping("/evaluate/{guestId}")
    public ResponseEntity<TierDto> evaluateGuestTier(@PathVariable Long guestId) {
        TierDto dto = tierService.evaluateGuestTier(guestId);
        return dto != null ? ResponseEntity.ok(dto) : ResponseEntity.noContent().build();
    }

    @Operation(summary = "Get current tier of a guest")
    @GetMapping("/guest/{guestId}")
    public ResponseEntity<TierDto> getCurrentTier(@PathVariable Long guestId) {
        TierDto dto = tierService.getCurrentTier(guestId);
        return dto != null ? ResponseEntity.ok(dto) : ResponseEntity.noContent().build();
    }
}
