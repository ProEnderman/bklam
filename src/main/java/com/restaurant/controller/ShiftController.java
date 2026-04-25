package com.restaurant.controller;

import com.restaurant.dto.ShiftDtos.*;
import com.restaurant.model.ShiftSwapRequest;
import com.restaurant.service.RestaurantDataExportService;
import com.restaurant.service.ShiftService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Tag(name = "Shifts", description = "Shift scheduling management")
@RestController
@RequestMapping("/api/shifts")
@RequiredArgsConstructor
public class ShiftController {
    
    private final ShiftService shiftService;
    private final RestaurantDataExportService restaurantDataExportService;

    @Operation(summary = "Export shifts to CSV (for Excel / Google Sheets)")
    @GetMapping(value = "/export-csv", produces = "text/csv; charset=UTF-8")
    public ResponseEntity<byte[]> exportShiftsCsv(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long restaurantId
    ) {
        byte[] csv = restaurantDataExportService.exportShiftsCsv(from, to, restaurantId);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDispositionFormData("attachment", "shifts.csv");
        headers.setContentType(MediaType.parseMediaType("text/csv; charset=UTF-8"));
        return ResponseEntity.ok().headers(headers).body(csv);
    }

    // Shifts
    @Operation(summary = "Get shifts")
    @GetMapping
    public ResponseEntity<List<ShiftDto>> getShifts(
        @RequestParam(required = false) Long employeeId,
        @RequestParam(required = false) Long restaurantId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to
    ) {
        List<ShiftDto> shifts = shiftService.getShifts(employeeId, restaurantId, from, to);
        return ResponseEntity.ok(shifts);
    }
    
    @Operation(summary = "Get shift by ID")
    @GetMapping("/{id}")
    public ResponseEntity<ShiftDto> getShift(@PathVariable Long id) {
        ShiftDto shift = shiftService.getShiftById(id);
        return ResponseEntity.ok(shift);
    }
    
    @Operation(summary = "Create shift")
    @PostMapping
    public ResponseEntity<ShiftDto> createShift(@Valid @RequestBody CreateShiftRequest request) {
        ShiftDto created = shiftService.createShift(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Create multiple shifts")
    @PostMapping("/bulk")
    public ResponseEntity<List<ShiftDto>> createShiftsBulk(@Valid @RequestBody BulkCreateShiftsRequest request) {
        List<ShiftDto> created = shiftService.createShiftsBulk(request.shifts());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Update shift")
    @PutMapping("/{id}")
    public ResponseEntity<ShiftDto> updateShift(@PathVariable Long id, @Valid @RequestBody UpdateShiftRequest request) {
        ShiftDto updated = shiftService.updateShift(id, request);
        return ResponseEntity.ok(updated);
    }
    
    @Operation(summary = "Delete shift")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteShift(@PathVariable Long id) {
        shiftService.deleteShift(id);
        return ResponseEntity.noContent().build();
    }
    
    @Operation(summary = "Publish shift")
    @PostMapping("/{id}/publish")
    public ResponseEntity<ShiftDto> publishShift(@PathVariable Long id) {
        ShiftDto shift = shiftService.publishShift(id);
        return ResponseEntity.ok(shift);
    }
    
    @Operation(summary = "Publish all shifts for a week")
    @PostMapping("/publish-week")
    public ResponseEntity<Void> publishWeek(@RequestBody PublishWeekRequest request) {
        shiftService.publishWeek(request.weekStart());
        return ResponseEntity.ok().build();
    }
    
    @Operation(summary = "Lock shift")
    @PostMapping("/{id}/lock")
    public ResponseEntity<ShiftDto> lockShift(@PathVariable Long id) {
        ShiftDto shift = shiftService.lockShift(id);
        return ResponseEntity.ok(shift);
    }
    
    @Operation(summary = "Get shift conflicts")
    @GetMapping("/conflicts")
    public ResponseEntity<List<ShiftDto>> getConflicts(
        @RequestParam Long restaurantId,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startTime,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endTime
    ) {
        List<ShiftDto> conflicts = shiftService.findConflicts(restaurantId, startTime, endTime);
        return ResponseEntity.ok(conflicts);
    }
    
    // Shift Templates
    @Operation(summary = "Get shift templates")
    @GetMapping("/templates")
    public ResponseEntity<List<ShiftTemplateDto>> getShiftTemplates(@RequestParam(required = false) Long restaurantId) {
        List<ShiftTemplateDto> templates = shiftService.getShiftTemplates(restaurantId);
        return ResponseEntity.ok(templates);
    }
    
    @Operation(summary = "Create shift template")
    @PostMapping("/templates")
    public ResponseEntity<ShiftTemplateDto> createShiftTemplate(@Valid @RequestBody CreateShiftTemplateRequest request) {
        ShiftTemplateDto created = shiftService.createShiftTemplate(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Delete shift template")
    @DeleteMapping("/templates/{id}")
    public ResponseEntity<Void> deleteShiftTemplate(@PathVariable Long id) {
        shiftService.deleteShiftTemplate(id);
        return ResponseEntity.noContent().build();
    }
    
    @Operation(summary = "Generate shifts from template")
    @PostMapping("/templates/{id}/generate")
    public ResponseEntity<List<ShiftDto>> generateFromTemplate(
        @PathVariable Long id,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        @RequestParam List<Long> employeeIds
    ) {
        List<ShiftDto> created = shiftService.generateShiftsFromTemplate(id, startDate, endDate, employeeIds);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    // Shift Swap Requests
    @Operation(summary = "Create shift swap request")
    @PostMapping("/swap")
    public ResponseEntity<ShiftSwapRequestDto> createSwapRequest(@Valid @RequestBody ShiftSwapRequest request) {
        ShiftSwapRequestDto created = shiftService.createSwapRequest(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Accept swap request")
    @PostMapping("/swap/{id}/accept")
    public ResponseEntity<ShiftSwapRequestDto> acceptSwapRequest(@PathVariable Long id) {
        ShiftSwapRequestDto request = shiftService.acceptSwapRequest(id);
        return ResponseEntity.ok(request);
    }
    
    @Operation(summary = "Reject swap request")
    @PostMapping("/swap/{id}/reject")
    public ResponseEntity<ShiftSwapRequestDto> rejectSwapRequest(@PathVariable Long id) {
        ShiftSwapRequestDto request = shiftService.rejectSwapRequest(id);
        return ResponseEntity.ok(request);
    }
}
