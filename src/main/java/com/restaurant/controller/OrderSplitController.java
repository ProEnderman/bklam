package com.restaurant.controller;

import com.restaurant.dto.CreateOrderSplitRequest;
import com.restaurant.dto.OrderSplitDto;
import com.restaurant.service.SplitBillService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Split Bill", description = "Split an order into shares for separate billing")
@RestController
@RequestMapping("/api/orders/{orderId}/split")
@RequiredArgsConstructor
public class OrderSplitController {

    private final SplitBillService splitBillService;

    @Operation(summary = "Create split for an order (strict partition of all items)")
    @PostMapping
    public ResponseEntity<?> createSplit(
            @PathVariable Long orderId,
            @Valid @RequestBody CreateOrderSplitRequest request) {
        OrderSplitDto dto = splitBillService.createSplit(orderId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(dto);
    }

    @Operation(summary = "Get current split breakdown")
    @GetMapping
    public ResponseEntity<OrderSplitDto> getSplit(@PathVariable Long orderId) {
        return ResponseEntity.ok(splitBillService.getSplit(orderId));
    }

    @Operation(summary = "Delete split (restore unsplit state)")
    @DeleteMapping
    public ResponseEntity<Void> deleteSplit(@PathVariable Long orderId) {
        splitBillService.deleteSplit(orderId);
        return ResponseEntity.noContent().build();
    }
}
