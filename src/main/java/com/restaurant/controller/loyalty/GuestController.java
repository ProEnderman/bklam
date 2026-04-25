package com.restaurant.controller.loyalty;

import com.restaurant.dto.loyalty.*;
import com.restaurant.service.loyalty.GuestService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Loyalty - Guests", description = "Guest CRM-lite management")
@RestController
@RequestMapping("/api/loyalty/guests")
@RequiredArgsConstructor
public class GuestController {

    private final GuestService guestService;

    @Operation(summary = "Search guests by phone, name or email")
    @GetMapping
    public ResponseEntity<Page<GuestDto>> searchGuests(
        @RequestParam(required = false) String query,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(guestService.searchGuests(query, PageRequest.of(page, size)));
    }

    @Operation(summary = "Find guest by phone number")
    @GetMapping("/by-phone")
    public ResponseEntity<GuestDto> findByPhone(@RequestParam String phone) {
        GuestDto dto = guestService.findByPhone(phone);
        if (dto == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(dto);
    }

    @Operation(summary = "Get guest by ID")
    @GetMapping("/{id}")
    public ResponseEntity<GuestDto> getById(@PathVariable Long id) {
        return ResponseEntity.ok(guestService.getById(id));
    }

    @Operation(summary = "Get full guest profile (bonus, tier, missions, achievements, RFM)")
    @GetMapping("/{id}/profile")
    public ResponseEntity<GuestProfileDto> getProfile(@PathVariable Long id) {
        return ResponseEntity.ok(guestService.getProfile(id));
    }

    @Operation(summary = "Create new guest")
    @PostMapping
    public ResponseEntity<GuestDto> createGuest(@Valid @RequestBody CreateGuestRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(guestService.createGuest(request));
    }

    @Operation(summary = "Update guest info")
    @PutMapping("/{id}")
    public ResponseEntity<GuestDto> updateGuest(@PathVariable Long id, @Valid @RequestBody UpdateGuestRequest request) {
        return ResponseEntity.ok(guestService.updateGuest(id, request));
    }

    @Operation(summary = "Merge two guests (soft merge with alias)")
    @PostMapping("/merge")
    public ResponseEntity<GuestDto> mergeGuests(@Valid @RequestBody GuestMergeRequest request) {
        return ResponseEntity.ok(guestService.mergeGuests(request));
    }

    @Operation(summary = "Count total guests")
    @GetMapping("/count")
    public ResponseEntity<Long> countGuests() {
        return ResponseEntity.ok(guestService.countGuests());
    }
}
