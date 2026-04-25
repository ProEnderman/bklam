package com.restaurant.controller;

import com.restaurant.service.AvailabilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

@Tag(name = "Availability", description = "Check availability for bookings")
@RestController
@RequestMapping("/api/availability")
@RequiredArgsConstructor
public class AvailabilityController {
    
    private final AvailabilityService availabilityService;
    
    @Operation(summary = "Get availability for activity")
    @GetMapping
    public ResponseEntity<Map<String, Object>> getAvailability(
        @RequestParam Long branchId,
        @RequestParam Long activityId,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to
    ) {
        Map<String, Object> availability = availabilityService.getAvailability(branchId, activityId, from, to);
        return ResponseEntity.ok(availability);
    }
}




