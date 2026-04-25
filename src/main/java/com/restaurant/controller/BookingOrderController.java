package com.restaurant.controller;

import com.restaurant.model.BookingOrder;
import com.restaurant.service.BookingOrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Tag(name = "Booking orders", description = "Заказы по бронированиям. Удаление заказа не отменяет бронирования.")
@RestController
@RequestMapping("/api/booking-orders")
@RequiredArgsConstructor
public class BookingOrderController {

    private final BookingOrderService bookingOrderService;

    @Operation(summary = "Create booking order (to link bookings to)")
    @PostMapping
    public ResponseEntity<BookingOrder> create(@RequestBody Map<String, Object> body) {
        Long branchId = body.get("branchId") != null ? ((Number) body.get("branchId")).longValue() : null;
        String customerName = body.get("customerName") != null ? body.get("customerName").toString() : null;
        String customerPhone = body.get("customerPhone") != null ? body.get("customerPhone").toString() : null;
        if (branchId == null) {
            return ResponseEntity.badRequest().build();
        }
        BookingOrder created = bookingOrderService.create(branchId, customerName, customerPhone);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "Delete booking order. cancelBookings=false (default): only unlink. cancelBookings=true: cancel all bookings then delete.")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @RequestParam(defaultValue = "false") boolean cancelBookings) {
        bookingOrderService.delete(id, cancelBookings);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Dissolve group. cancelBookings=false (default): unlink only. cancelBookings=true: cancel all bookings in group.")
    @PostMapping("/dissolve")
    public ResponseEntity<Void> dissolve(@RequestBody Map<String, Object> body) {
        Long branchId = body.get("branchId") != null ? ((Number) body.get("branchId")).longValue() : null;
        String customerName = body.get("customerName") != null ? body.get("customerName").toString() : null;
        String customerPhone = body.get("customerPhone") != null ? body.get("customerPhone").toString() : null;
        boolean cancelBookings = body.get("cancelBookings") == Boolean.TRUE || "true".equalsIgnoreCase(String.valueOf(body.get("cancelBookings")));
        if (branchId == null) {
            return ResponseEntity.badRequest().build();
        }
        bookingOrderService.dissolveGroup(branchId, customerName, customerPhone, cancelBookings);
        return ResponseEntity.noContent().build();
    }
}
