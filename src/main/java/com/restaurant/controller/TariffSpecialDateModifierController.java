package com.restaurant.controller;

import com.restaurant.model.TariffSpecialDateModifier;
import com.restaurant.service.TariffSpecialDateModifierService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Tag(name = "Tariff Special Date Modifiers", description = "Manage price modifiers for special dates in tariffs")
@RestController
@RequestMapping("/api/tariffs/{tariffPlanId}/special-date-modifiers")
@RequiredArgsConstructor
public class TariffSpecialDateModifierController {
    
    private final TariffSpecialDateModifierService modifierService;
    
    @Operation(summary = "Get all modifiers for tariff")
    @GetMapping
    public ResponseEntity<List<TariffSpecialDateModifier>> getModifiers(@PathVariable Long tariffPlanId) {
        List<TariffSpecialDateModifier> modifiers = modifierService.getModifiersForTariff(tariffPlanId);
        return ResponseEntity.ok(modifiers);
    }
    
    @Operation(summary = "Get modifier for specific date")
    @GetMapping("/date")
    public ResponseEntity<TariffSpecialDateModifier> getModifierForDate(
        @PathVariable Long tariffPlanId,
        @RequestParam LocalDate date
    ) {
        TariffSpecialDateModifier modifier = modifierService.getModifierForDate(tariffPlanId, date);
        if (modifier == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(modifier);
    }
    
    @Operation(summary = "Initialize modifiers for all special dates in calendar")
    @PostMapping("/initialize")
    public ResponseEntity<Void> initializeModifiers(
        @PathVariable Long tariffPlanId,
        @RequestParam Long calendarId
    ) {
        modifierService.initializeModifiersForCalendar(tariffPlanId, calendarId);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }
    
    @Operation(summary = "Bulk upsert modifiers")
    @PutMapping
    public ResponseEntity<Void> upsertModifiers(
        @PathVariable Long tariffPlanId,
        @RequestBody Map<String, Map<String, Object>> modifiers
    ) {
        // Преобразуем строковые ключи (YYYY-MM-DD) в LocalDate
        Map<LocalDate, Map<String, Object>> dateModifiers = new java.util.HashMap<>();
        for (Map.Entry<String, Map<String, Object>> entry : modifiers.entrySet()) {
            LocalDate date = LocalDate.parse(entry.getKey());
            dateModifiers.put(date, entry.getValue());
        }
        modifierService.upsertModifiers(tariffPlanId, dateModifiers);
        return ResponseEntity.ok().build();
    }
    
    @Operation(summary = "Update modifier")
    @PutMapping("/{id}")
    public ResponseEntity<TariffSpecialDateModifier> updateModifier(
        @PathVariable Long id,
        @Valid @RequestBody TariffSpecialDateModifier modifier
    ) {
        TariffSpecialDateModifier updated = modifierService.updateModifier(id, modifier);
        return ResponseEntity.ok(updated);
    }
    
    @Operation(summary = "Delete modifier")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteModifier(@PathVariable Long id) {
        modifierService.deleteModifier(id);
        return ResponseEntity.noContent().build();
    }
}

