package com.restaurant.controller;

import com.restaurant.dto.HallDtos;
import com.restaurant.service.HallService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Slf4j
@Tag(name = "Hall Map", description = "Hall map editor and waiter view")
@RestController
@RequestMapping("/api/hall")
@RequiredArgsConstructor
public class HallController {

    private final HallService hallService;

    @Operation(summary = "Get full hall view (map + zones + items + assets + tables)")
    @GetMapping("/view")
    public ResponseEntity<HallDtos.HallViewDto> getView() {
        return ResponseEntity.ok(hallService.getHallView());
    }

    @Operation(summary = "Update map settings (admin)")
    @PutMapping("/map")
    public ResponseEntity<HallDtos.HallMapDto> updateMap(@RequestBody HallDtos.HallMapDto req) {
        return ResponseEntity.ok(hallService.updateMap(req));
    }

    @Operation(summary = "Get zones")
    @GetMapping("/zones")
    public ResponseEntity<List<HallDtos.HallZoneDto>> getZones() {
        return ResponseEntity.ok(hallService.getZones());
    }

    @Operation(summary = "Create zone (admin)")
    @PostMapping("/zones")
    public ResponseEntity<HallDtos.HallZoneDto> createZone(@RequestBody HallDtos.HallZoneDto req) {
        return ResponseEntity.ok(hallService.createZone(req));
    }

    @Operation(summary = "Update zone (admin)")
    @PatchMapping("/zones/{id}")
    public ResponseEntity<HallDtos.HallZoneDto> updateZone(@PathVariable Long id, @RequestBody HallDtos.HallZoneDto req) {
        return ResponseEntity.ok(hallService.updateZone(id, req));
    }

    @Operation(summary = "Delete zone (admin)")
    @DeleteMapping("/zones/{id}")
    public ResponseEntity<Void> deleteZone(@PathVariable Long id) {
        hallService.deleteZone(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Get placed items")
    @GetMapping("/items")
    public ResponseEntity<List<HallDtos.HallPlacedItemDto>> getItems() {
        return ResponseEntity.ok(hallService.getItems());
    }

    @Operation(summary = "Replace all placed items (admin)")
    @PutMapping("/items")
    public ResponseEntity<List<HallDtos.HallPlacedItemDto>> replaceItems(@RequestBody List<HallDtos.HallPlacedItemDto> req) {
        return ResponseEntity.ok(hallService.replaceItems(req));
    }

    @Operation(summary = "Patch placed items (differential update, admin)")
    @PatchMapping("/items")
    public ResponseEntity<HallDtos.HallItemsPatchResponse> patchItems(@RequestBody HallDtos.HallItemsPatchRequest req) {
        log.info("HallController.patchItems called");
        try {
            HallDtos.HallItemsPatchResponse response = hallService.patchItems(req);
            log.info("HallController.patchItems success");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("HallController.patchItems error: {}", e.getMessage(), e);
            throw e;
        }
    }

    @Operation(summary = "Get assets")
    @GetMapping("/assets")
    public ResponseEntity<List<HallDtos.HallAssetDto>> getAssets() {
        return ResponseEntity.ok(hallService.getAssets());
    }

    @Operation(summary = "Create asset (admin)")
    @PostMapping("/assets")
    public ResponseEntity<HallDtos.HallAssetDto> createAsset(@RequestBody HallDtos.HallAssetDto req) {
        return ResponseEntity.ok(hallService.createAsset(req));
    }

    @Operation(summary = "Upload asset image (admin)")
    @PostMapping(value = "/assets/{id}/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<HallDtos.HallAssetDto> uploadAssetImage(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(hallService.uploadAssetImage(id, file));
    }

    @Operation(summary = "Get tables")
    @GetMapping("/tables")
    public ResponseEntity<List<HallDtos.HallTableDto>> getTables() {
        return ResponseEntity.ok(hallService.getTables());
    }

    @Operation(summary = "Get active tables placed on hall map (for reservations)")
    @GetMapping("/tables/active")
    public ResponseEntity<List<HallDtos.HallTableDto>> getActiveTablesOnMap() {
        return ResponseEntity.ok(hallService.getActiveTablesOnMap());
    }

    @Operation(summary = "Create table (admin)")
    @PostMapping("/tables")
    public ResponseEntity<HallDtos.HallTableDto> createTable(@RequestBody HallDtos.HallTableDto req) {
        return ResponseEntity.ok(hallService.createTable(req));
    }
}


