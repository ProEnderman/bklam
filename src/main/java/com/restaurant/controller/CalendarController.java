package com.restaurant.controller;

import com.restaurant.dto.CalendarUpdateResponse;
import com.restaurant.model.Calendar;
import com.restaurant.service.CalendarService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@Tag(name = "Calendars", description = "Calendar management for special dates")
@RestController
@RequestMapping("/api/calendars")
@RequiredArgsConstructor
public class CalendarController {
    
    private final CalendarService calendarService;
    
    @Operation(summary = "Get all calendars")
    @GetMapping
    public ResponseEntity<List<Calendar>> getCalendars(
        @RequestParam(required = false) Long organizationId,
        @RequestParam(required = false) Long branchId
    ) {
        List<Calendar> calendars = calendarService.getCalendars(organizationId, branchId);
        return ResponseEntity.ok(calendars);
    }
    
    @Operation(summary = "Get calendar by ID")
    @GetMapping("/{id}")
    public ResponseEntity<Calendar> getCalendar(@PathVariable Long id) {
        Calendar calendar = calendarService.getCalendarById(id);
        return ResponseEntity.ok(calendar);
    }
    
    @Operation(summary = "Create calendar")
    @PostMapping
    public ResponseEntity<Calendar> createCalendar(@Valid @RequestBody Calendar calendar) {
        Calendar created = calendarService.createCalendar(calendar);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Update calendar")
    @PutMapping("/{id}")
    public ResponseEntity<CalendarUpdateResponse> updateCalendar(@PathVariable Long id, @Valid @RequestBody Calendar calendar) {
        CalendarUpdateResponse response = calendarService.updateCalendar(id, calendar);
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Delete calendar")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCalendar(@PathVariable Long id) {
        calendarService.deleteCalendar(id);
        return ResponseEntity.noContent().build();
    }
    
    @Operation(summary = "Add special date to calendar")
    @PostMapping("/{id}/special-dates")
    public ResponseEntity<Calendar> addSpecialDate(
        @PathVariable Long id,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        calendarService.addSpecialDate(id, date);
        // getCalendarById уже инициализирует коллекцию в рамках транзакции
        Calendar calendar = calendarService.getCalendarById(id);
        return ResponseEntity.ok(calendar);
    }
    
    @Operation(summary = "Remove special date from calendar")
    @DeleteMapping("/{id}/special-dates")
    public ResponseEntity<Calendar> removeSpecialDate(
        @PathVariable Long id,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        calendarService.removeSpecialDate(id, date);
        // getCalendarById уже инициализирует коллекцию в рамках транзакции
        Calendar calendar = calendarService.getCalendarById(id);
        return ResponseEntity.ok(calendar);
    }
}


