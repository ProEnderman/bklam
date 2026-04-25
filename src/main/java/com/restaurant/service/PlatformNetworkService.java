package com.restaurant.service;

import com.restaurant.model.*;
import com.restaurant.repository.*;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Platform (HEAD_ADMIN) CRUD for network hierarchy: holdings, brands, legal entities, locations, warehouses.
 * Controllers and DTOs are added in a later step.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlatformNetworkService {

    private final HoldingRepository holdingRepository;
    private final BrandRepository brandRepository;
    private final LegalEntityRepository legalEntityRepository;
    private final LocationRepository locationRepository;
    private final WarehouseRepository warehouseRepository;

    private void requireHeadAdmin() {
        if (!SecurityUtils.isHeadAdmin()) {
            throw new com.restaurant.exception.BusinessException("Only HEAD_ADMIN can manage network hierarchy");
        }
    }

    // ---------- Holdings ----------
    public List<Holding> findAllHoldings() {
        requireHeadAdmin();
        return holdingRepository.findAll();
    }

    public Holding getHoldingById(Long id) {
        requireHeadAdmin();
        return holdingRepository.findById(id)
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Holding not found: " + id));
    }

    @Transactional
    public Holding createHolding(String name) {
        requireHeadAdmin();
        Holding h = new Holding();
        h.setName(name);
        return holdingRepository.save(h);
    }

    // ---------- Brands ----------
    public List<Brand> findBrandsByHoldingId(Long holdingId) {
        requireHeadAdmin();
        return brandRepository.findByHoldingId(holdingId);
    }

    @Transactional
    public Brand createBrand(Long holdingId, String name) {
        requireHeadAdmin();
        Holding holding = getHoldingById(holdingId);
        Brand b = new Brand();
        b.setHolding(holding);
        b.setName(name);
        return brandRepository.save(b);
    }

    // ---------- Legal entities ----------
    public List<LegalEntity> findLegalEntitiesByHoldingId(Long holdingId) {
        requireHeadAdmin();
        return legalEntityRepository.findByHoldingId(holdingId);
    }

    @Transactional
    public LegalEntity createLegalEntity(Long holdingId, String name, String inn, String kpp) {
        requireHeadAdmin();
        Holding holding = getHoldingById(holdingId);
        LegalEntity e = new LegalEntity();
        e.setHolding(holding);
        e.setName(name);
        e.setInn(inn);
        e.setKpp(kpp);
        return legalEntityRepository.save(e);
    }

    // ---------- Locations ----------
    public List<Location> findLocationsByHoldingId(Long holdingId) {
        requireHeadAdmin();
        return locationRepository.findByHoldingId(holdingId);
    }

    public List<Location> findAllLocations() {
        requireHeadAdmin();
        return locationRepository.findAll();
    }

    public Location getLocationById(Long id) {
        requireHeadAdmin();
        return locationRepository.findById(id)
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Location not found: " + id));
    }

    @Transactional
    public Location createLocation(Long holdingId, String name, Long brandId, Long legalEntityId) {
        requireHeadAdmin();
        Holding holding = getHoldingById(holdingId);
        Location loc = new Location();
        loc.setHolding(holding);
        loc.setName(name);
        if (brandId != null) {
            loc.setBrand(brandRepository.findById(brandId)
                    .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Brand not found: " + brandId)));
        }
        if (legalEntityId != null) {
            loc.setLegalEntity(legalEntityRepository.findById(legalEntityId)
                    .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Legal entity not found: " + legalEntityId)));
        }
        return locationRepository.save(loc);
    }

    /** Resolve location by legacy restaurant id (for tenant fallback). */
    public Optional<Location> findLocationByLegacyRestaurantId(Long restaurantId) {
        return locationRepository.findByLegacyRestaurant_Id(restaurantId);
    }

    // ---------- Warehouses ----------
    public List<Warehouse> findWarehousesByLocationId(Long locationId) {
        requireHeadAdmin();
        return warehouseRepository.findByLocationId(locationId);
    }

    @Transactional
    public Warehouse createWarehouse(Long locationId, String name, WarehouseType type) {
        requireHeadAdmin();
        Location location = getLocationById(locationId);
        Warehouse w = new Warehouse();
        w.setLocation(location);
        w.setName(name);
        w.setType(type != null ? type : WarehouseType.WAREHOUSE);
        return warehouseRepository.save(w);
    }
}
