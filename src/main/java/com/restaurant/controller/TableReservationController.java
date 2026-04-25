package com.restaurant.controller;

import com.restaurant.model.TableReservation;
import com.restaurant.service.TableReservationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@Tag(name = "Table Reservations", description = "Restaurant table reservation management")
@RestController
@RequestMapping("/api/table-reservations")
@RequiredArgsConstructor
public class TableReservationController {

    private final TableReservationService reservationService;

    @Operation(summary = "Get all table reservations")
    @GetMapping
    public ResponseEntity<List<TableReservation>> getReservations(
        @RequestParam(required = false) Long restaurantId,
        @RequestParam(required = false) Long tableId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
        @RequestParam(required = false) TableReservation.ReservationStatus status
    ) {
        List<TableReservation> reservations = reservationService.getReservations(restaurantId, tableId, from, to, status);
        return ResponseEntity.ok(reservations);
    }

    @Operation(summary = "Get table reservation by ID")
    @GetMapping("/{id}")
    public ResponseEntity<TableReservation> getReservation(@PathVariable Long id) {
        TableReservation reservation = reservationService.getReservationById(id);
        return ResponseEntity.ok(reservation);
    }

    @Operation(summary = "Create table reservation")
    @PostMapping
    public ResponseEntity<TableReservation> createReservation(@Valid @RequestBody TableReservation reservation) {
        TableReservation created = reservationService.createReservation(reservation);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "Update table reservation")
    @PutMapping("/{id}")
    public ResponseEntity<TableReservation> updateReservation(@PathVariable Long id, @Valid @RequestBody TableReservation reservation) {
        TableReservation updated = reservationService.updateReservation(id, reservation);
        return ResponseEntity.ok(updated);
    }

    @Operation(summary = "Cancel table reservation")
    @PostMapping("/{id}/cancel")
    public ResponseEntity<TableReservation> cancelReservation(@PathVariable Long id) {
        TableReservation cancelled = reservationService.cancelReservation(id);
        return ResponseEntity.ok(cancelled);
    }

    @Operation(summary = "Complete table reservation")
    @PostMapping("/{id}/complete")
    public ResponseEntity<TableReservation> completeReservation(@PathVariable Long id) {
        TableReservation completed = reservationService.completeReservation(id);
        return ResponseEntity.ok(completed);
    }
}
