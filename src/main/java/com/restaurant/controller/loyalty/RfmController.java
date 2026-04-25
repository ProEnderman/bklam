package com.restaurant.controller.loyalty;

import com.restaurant.dto.loyalty.RfmSnapshotDto;
import com.restaurant.service.loyalty.RfmService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "Loyalty - RFM Analysis", description = "Recency/Frequency/Monetary analysis")
@RestController
@RequestMapping("/api/loyalty/rfm")
@RequiredArgsConstructor
public class RfmController {

    private final RfmService rfmService;

    @Operation(summary = "Get latest RFM snapshot for a guest")
    @GetMapping("/guest/{guestId}")
    public ResponseEntity<RfmSnapshotDto> getLatest(@PathVariable Long guestId) {
        RfmSnapshotDto dto = rfmService.getLatestForGuest(guestId);
        return dto != null ? ResponseEntity.ok(dto) : ResponseEntity.noContent().build();
    }

    @Operation(summary = "Get RFM history for a guest")
    @GetMapping("/guest/{guestId}/history")
    public ResponseEntity<List<RfmSnapshotDto>> getHistory(@PathVariable Long guestId) {
        return ResponseEntity.ok(rfmService.getHistoryForGuest(guestId));
    }

    @Operation(summary = "Get segment distribution (latest snapshot)")
    @GetMapping("/distribution")
    public ResponseEntity<Map<String, Long>> getDistribution() {
        return ResponseEntity.ok(rfmService.getSegmentDistribution());
    }

    @Operation(summary = "Run RFM analysis (manual trigger)")
    @PostMapping("/run")
    public ResponseEntity<List<RfmSnapshotDto>> runAnalysis(@RequestBody(required = false) Map<Long, RfmService.RfmInputData> guestData) {
        return ResponseEntity.ok(rfmService.runAnalysis(guestData));
    }
}
