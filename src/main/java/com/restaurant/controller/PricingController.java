package com.restaurant.controller;

import com.restaurant.service.PricingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Pricing", description = "Price calculation engine")
@RestController
@RequestMapping("/api/pricing")
@RequiredArgsConstructor
public class PricingController {
    
    private final PricingService pricingService;
    
    @Operation(summary = "Preview price calculation (test)")
    @PostMapping("/preview")
    public ResponseEntity<PricingService.PricingResult> preview(
        @RequestBody PricingService.PricingRequest request
    ) {
        PricingService.PricingResult result = pricingService.preview(request);
        return ResponseEntity.ok(result);
    }
    
    @Operation(summary = "Run price calculation (save result)")
    @PostMapping("/run")
    public ResponseEntity<PricingService.PricingResult> run(
        @RequestBody PricingService.PricingRequest request
    ) {
        PricingService.PricingResult result = pricingService.run(request);
        return ResponseEntity.ok(result);
    }
}

