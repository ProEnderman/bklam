package com.restaurant.controller.loyalty;

import com.restaurant.dto.loyalty.CampaignDto;
import com.restaurant.dto.loyalty.CreateCampaignRequest;
import com.restaurant.model.loyalty.CampaignStatus;
import com.restaurant.service.loyalty.CampaignService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Loyalty - Campaigns", description = "Campaign / promo management & loyalty program constructor")
@RestController
@RequestMapping("/api/loyalty/campaigns")
@RequiredArgsConstructor
public class CampaignController {

    private final CampaignService campaignService;

    @Operation(summary = "Get all campaigns (paged)")
    @GetMapping
    public ResponseEntity<Page<CampaignDto>> getCampaigns(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String scope
    ) {
        return ResponseEntity.ok(campaignService.getCampaigns(PageRequest.of(page, size), scope));
    }

    @Operation(summary = "Get currently active campaigns")
    @GetMapping("/active")
    public ResponseEntity<List<CampaignDto>> getActiveCampaigns(
        @RequestParam(required = false) String scope
    ) {
        return ResponseEntity.ok(campaignService.getActiveCampaigns(scope));
    }

    @Operation(summary = "Get campaign by ID")
    @GetMapping("/{id}")
    public ResponseEntity<CampaignDto> getById(@PathVariable Long id) {
        return ResponseEntity.ok(campaignService.getById(id));
    }

    @Operation(summary = "Create a new campaign")
    @PostMapping
    public ResponseEntity<CampaignDto> createCampaign(@Valid @RequestBody CreateCampaignRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(campaignService.createCampaign(request));
    }

    @Operation(summary = "Update a campaign")
    @PutMapping("/{id}")
    public ResponseEntity<CampaignDto> updateCampaign(@PathVariable Long id, @Valid @RequestBody CreateCampaignRequest request) {
        return ResponseEntity.ok(campaignService.updateCampaign(id, request));
    }

    @Operation(summary = "Change campaign status (ACTIVE, PAUSED, ARCHIVED)")
    @PatchMapping("/{id}/status")
    public ResponseEntity<CampaignDto> changeStatus(@PathVariable Long id, @RequestParam CampaignStatus status) {
        return ResponseEntity.ok(campaignService.changeStatus(id, status));
    }

    @Operation(summary = "Delete a campaign")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCampaign(@PathVariable Long id) {
        campaignService.deleteCampaign(id);
        return ResponseEntity.noContent().build();
    }
}
