package com.restaurant.controller;

import com.restaurant.dto.*;
import com.restaurant.model.Holding;
import com.restaurant.model.Location;
import com.restaurant.model.Warehouse;
import com.restaurant.model.WarehouseType;
import com.restaurant.service.PlatformNetworkService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Platform Network", description = "Network hierarchy: holdings, brands, legal entities, locations, warehouses (HEAD_ADMIN only)")
@RestController
@RequestMapping("/api/platform")
@RequiredArgsConstructor
public class PlatformNetworkController {

    private final PlatformNetworkService platformNetworkService;

    @Operation(summary = "List holdings")
    @GetMapping("/holdings")
    public ResponseEntity<List<HoldingDto>> getHoldings() {
        List<Holding> list = platformNetworkService.findAllHoldings();
        return ResponseEntity.ok(list.stream().map(HoldingDto::fromEntity).toList());
    }

    @Operation(summary = "Create holding")
    @PostMapping("/holdings")
    public ResponseEntity<HoldingDto> createHolding(@Valid @RequestBody CreateHoldingRequest request) {
        Holding created = platformNetworkService.createHolding(request.name());
        return ResponseEntity.ok(HoldingDto.fromEntity(created));
    }

    @Operation(summary = "List brands by holding")
    @GetMapping("/brands")
    public ResponseEntity<List<BrandDto>> getBrands(@RequestParam Long holdingId) {
        List<BrandDto> list = platformNetworkService.findBrandsByHoldingId(holdingId).stream()
                .map(BrandDto::fromEntity).toList();
        return ResponseEntity.ok(list);
    }

    @Operation(summary = "Create brand")
    @PostMapping("/brands")
    public ResponseEntity<BrandDto> createBrand(@Valid @RequestBody CreateBrandRequest request) {
        var created = platformNetworkService.createBrand(request.holdingId(), request.name());
        return ResponseEntity.ok(BrandDto.fromEntity(created));
    }

    @Operation(summary = "List legal entities by holding")
    @GetMapping("/legal-entities")
    public ResponseEntity<List<LegalEntityDto>> getLegalEntities(@RequestParam Long holdingId) {
        List<LegalEntityDto> list = platformNetworkService.findLegalEntitiesByHoldingId(holdingId).stream()
                .map(LegalEntityDto::fromEntity).toList();
        return ResponseEntity.ok(list);
    }

    @Operation(summary = "Create legal entity")
    @PostMapping("/legal-entities")
    public ResponseEntity<LegalEntityDto> createLegalEntity(@Valid @RequestBody CreateLegalEntityRequest request) {
        var created = platformNetworkService.createLegalEntity(
                request.holdingId(), request.name(), request.inn(), request.kpp());
        return ResponseEntity.ok(LegalEntityDto.fromEntity(created));
    }

    @Operation(summary = "List locations (optionally filter by holdingId)")
    @GetMapping("/locations")
    public ResponseEntity<List<LocationDto>> getLocations(@RequestParam(required = false) Long holdingId) {
        List<Location> list = holdingId != null
                ? platformNetworkService.findLocationsByHoldingId(holdingId)
                : platformNetworkService.findAllLocations();
        return ResponseEntity.ok(list.stream().map(LocationDto::fromEntity).toList());
    }

    @Operation(summary = "Get location by ID")
    @GetMapping("/locations/{id}")
    public ResponseEntity<LocationDto> getLocationById(@PathVariable Long id) {
        Location loc = platformNetworkService.getLocationById(id);
        return ResponseEntity.ok(LocationDto.fromEntity(loc));
    }

    @Operation(summary = "Create location")
    @PostMapping("/locations")
    public ResponseEntity<LocationDto> createLocation(@Valid @RequestBody CreateLocationRequest request) {
        Location created = platformNetworkService.createLocation(
                request.holdingId(), request.name(), request.brandId(), request.legalEntityId());
        return ResponseEntity.ok(LocationDto.fromEntity(created));
    }

    @Operation(summary = "List warehouses by location")
    @GetMapping("/locations/{id}/warehouses")
    public ResponseEntity<List<WarehouseDto>> getWarehousesByLocation(@PathVariable Long id) {
        List<WarehouseDto> list = platformNetworkService.findWarehousesByLocationId(id).stream()
                .map(WarehouseDto::fromEntity).toList();
        return ResponseEntity.ok(list);
    }

    @Operation(summary = "Create warehouse")
    @PostMapping("/locations/{locationId}/warehouses")
    public ResponseEntity<WarehouseDto> createWarehouse(
            @PathVariable Long locationId,
            @Valid @RequestBody CreateWarehouseRequest request) {
        if (!request.locationId().equals(locationId)) {
            throw new IllegalArgumentException("locationId in path and body must match");
        }
        Warehouse created = platformNetworkService.createWarehouse(
                request.locationId(), request.name(),
                request.type() != null ? request.type() : WarehouseType.WAREHOUSE);
        return ResponseEntity.ok(WarehouseDto.fromEntity(created));
    }
}
