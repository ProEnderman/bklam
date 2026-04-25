package com.restaurant.controller;

import com.restaurant.model.TariffPlan;
import com.restaurant.model.TariffRule;
import com.restaurant.service.TariffService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Tariffs", description = "Tariff management")
@RestController
@RequestMapping("/api/tariffs")
@RequiredArgsConstructor
public class TariffController {
    
    private final TariffService tariffService;
    
    // Tariff Plans
    @Operation(summary = "Get all tariff plans")
    @GetMapping("/plans")
    public ResponseEntity<Page<TariffPlan>> getTariffPlans(
        @RequestParam(required = false) Long restaurantId,
        @RequestParam(required = false) Boolean isActive,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size);
        Page<TariffPlan> plans = tariffService.getTariffPlans(restaurantId, isActive, pageable);
        return ResponseEntity.ok(plans);
    }
    
    @Operation(summary = "Get tariff plan by ID")
    @GetMapping("/plans/{id}")
    public ResponseEntity<TariffPlan> getTariffPlan(@PathVariable Long id) {
        TariffPlan plan = tariffService.getTariffPlanById(id);
        return ResponseEntity.ok(plan);
    }
    
    @Operation(summary = "Create tariff plan")
    @PostMapping("/plans")
    public ResponseEntity<TariffPlan> createTariffPlan(@Valid @RequestBody TariffPlan plan) {
        TariffPlan created = tariffService.createTariffPlan(plan);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Update tariff plan")
    @PutMapping("/plans/{id}")
    public ResponseEntity<TariffPlan> updateTariffPlan(@PathVariable Long id, @Valid @RequestBody TariffPlan plan) {
        TariffPlan updated = tariffService.updateTariffPlan(id, plan);
        return ResponseEntity.ok(updated);
    }
    
    @Operation(summary = "Delete tariff plan")
    @DeleteMapping("/plans/{id}")
    public ResponseEntity<Void> deleteTariffPlan(@PathVariable Long id) {
        tariffService.deleteTariffPlan(id);
        return ResponseEntity.noContent().build();
    }
    
    // Tariff Rules
    @Operation(summary = "Get rules for tariff plan")
    @GetMapping("/plans/{planId}/rules")
    public ResponseEntity<List<TariffRule>> getTariffRules(@PathVariable Long planId) {
        List<TariffRule> rules = tariffService.getTariffRules(planId);
        return ResponseEntity.ok(rules);
    }
    
    @Operation(summary = "Create tariff rule")
    @PostMapping("/plans/{planId}/rules")
    public ResponseEntity<TariffRule> createTariffRule(
        @PathVariable Long planId,
        @RequestBody TariffRule rule
    ) {
        TariffRule created = tariffService.createTariffRule(planId, rule);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Update tariff rule")
    @PutMapping("/rules/{id}")
    public ResponseEntity<TariffRule> updateTariffRule(@PathVariable Long id, @RequestBody TariffRule rule) {
        TariffRule updated = tariffService.updateTariffRule(id, rule);
        return ResponseEntity.ok(updated);
    }
    
    @Operation(summary = "Delete tariff rule")
    @DeleteMapping("/rules/{id}")
    public ResponseEntity<Void> deleteTariffRule(@PathVariable Long id) {
        tariffService.deleteTariffRule(id);
        return ResponseEntity.noContent().build();
    }
    
}

