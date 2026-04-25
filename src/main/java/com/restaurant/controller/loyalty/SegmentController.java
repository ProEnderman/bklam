package com.restaurant.controller.loyalty;

import com.restaurant.dto.loyalty.CreateSegmentRequest;
import com.restaurant.dto.loyalty.SegmentDto;
import com.restaurant.service.loyalty.SegmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Loyalty - Segments", description = "Customer segments & targeting")
@RestController
@RequestMapping("/api/loyalty/segments")
@RequiredArgsConstructor
public class SegmentController {

    private final SegmentService segmentService;

    @Operation(summary = "Get all segments")
    @GetMapping
    public ResponseEntity<List<SegmentDto>> getSegments() {
        return ResponseEntity.ok(segmentService.getSegments());
    }

    @Operation(summary = "Create a new segment")
    @PostMapping
    public ResponseEntity<SegmentDto> createSegment(@Valid @RequestBody CreateSegmentRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(segmentService.createSegment(request));
    }

    @Operation(summary = "Update a segment")
    @PutMapping("/{id}")
    public ResponseEntity<SegmentDto> updateSegment(@PathVariable Long id, @Valid @RequestBody CreateSegmentRequest request) {
        return ResponseEntity.ok(segmentService.updateSegment(id, request));
    }

    @Operation(summary = "Delete a segment")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSegment(@PathVariable Long id) {
        segmentService.deleteSegment(id);
        return ResponseEntity.noContent().build();
    }
}
