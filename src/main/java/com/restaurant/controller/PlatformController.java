package com.restaurant.controller;

import com.restaurant.dto.CreateAdminRequest;
import com.restaurant.dto.CreateRestaurantRequest;
import com.restaurant.dto.RestaurantDto;
import com.restaurant.dto.UserDto;
import com.restaurant.model.Role;
import com.restaurant.service.PlatformService;
import io.swagger.v3.oas.annotations.Operation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Platform", description = "Platform management endpoints (HEAD_ADMIN only)")
@RestController
@RequestMapping("/api/platform")
@RequiredArgsConstructor
public class PlatformController {

    private static final Logger log = LoggerFactory.getLogger(PlatformController.class);

    private final PlatformService platformService;
    
    // ========== Управление ресторанами ==========
    
    @Operation(summary = "Get all restaurants", description = "Get list of all restaurants (HEAD_ADMIN only)")
    @GetMapping("/restaurants")
    public ResponseEntity<Page<RestaurantDto>> getAllRestaurants(Pageable pageable) {
        Page<RestaurantDto> restaurants = platformService.getAllRestaurants(pageable);
        return ResponseEntity.ok(restaurants);
    }
    
    @Operation(summary = "Get restaurant by ID", description = "Get restaurant details (HEAD_ADMIN only)")
    @GetMapping("/restaurants/{id}")
    public ResponseEntity<RestaurantDto> getRestaurantById(@PathVariable Long id) {
        RestaurantDto restaurant = platformService.getRestaurantById(id);
        return ResponseEntity.ok(restaurant);
    }
    
    @Operation(summary = "Create restaurant", description = "Create a new restaurant (HEAD_ADMIN only)")
    @PostMapping("/restaurants")
    public ResponseEntity<RestaurantDto> createRestaurant(
        @Valid @RequestBody CreateRestaurantRequest request
    ) {
        log.info("Create restaurant endpoint reached: name={}", request.name());
        RestaurantDto restaurant = platformService.createRestaurant(request);
        log.info("Create restaurant succeeded: id={}, name={}", restaurant.id(), restaurant.name());
        return ResponseEntity.ok(restaurant);
    }
    
    @Operation(summary = "Update restaurant", description = "Update restaurant details (HEAD_ADMIN only)")
    @PutMapping("/restaurants/{id}")
    public ResponseEntity<RestaurantDto> updateRestaurant(
        @PathVariable Long id,
        @Valid @RequestBody CreateRestaurantRequest request
    ) {
        RestaurantDto restaurant = platformService.updateRestaurant(id, request);
        return ResponseEntity.ok(restaurant);
    }
    
    @Operation(summary = "Delete restaurant", description = "Delete restaurant (HEAD_ADMIN only)")
    @DeleteMapping("/restaurants/{id}")
    public ResponseEntity<Void> deleteRestaurant(@PathVariable Long id) {
        platformService.deleteRestaurant(id);
        return ResponseEntity.ok().build();
    }
    
    // ========== Управление пользователями ==========
    
    @Operation(summary = "Create admin for restaurant", description = "Create ADMIN user for a restaurant (HEAD_ADMIN only)")
    @PostMapping("/restaurants/{restaurantId}/admins")
    public ResponseEntity<UserDto> createAdminForRestaurant(
        @PathVariable Long restaurantId,
        @Valid @RequestBody CreateAdminRequest request
    ) {
        UserDto admin = platformService.createAdminForRestaurant(restaurantId, request);
        return ResponseEntity.ok(admin);
    }
    
    @Operation(summary = "Get all users", description = "Get list of all users with optional restaurant filter (HEAD_ADMIN only)")
    @GetMapping("/users")
    public ResponseEntity<Page<UserDto>> getAllUsers(
        @RequestParam(required = false) Long restaurantId,
        Pageable pageable
    ) {
        Page<UserDto> users = platformService.getAllUsers(restaurantId, pageable);
        return ResponseEntity.ok(users);
    }
    
    @Operation(summary = "Update user role", description = "Change user role (HEAD_ADMIN only)")
    @PatchMapping("/users/{userId}/role")
    public ResponseEntity<UserDto> updateUserRole(
        @PathVariable Long userId,
        @RequestParam Role role
    ) {
        UserDto user = platformService.updateUserRole(userId, role);
        return ResponseEntity.ok(user);
    }
}

