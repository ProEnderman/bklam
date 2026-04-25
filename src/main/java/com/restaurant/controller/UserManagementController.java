package com.restaurant.controller;

import com.restaurant.dto.CreateAdminRequest;
import com.restaurant.dto.UpdateWorkerRequest;
import com.restaurant.dto.UserDto;
import com.restaurant.service.UserManagementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "User Management", description = "User management endpoints (ADMIN only, within own restaurant)")
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserManagementController {
    
    private final UserManagementService userManagementService;
    
    @Operation(summary = "Get restaurant users", description = "Get list of users in the restaurant (ADMIN only)")
    @GetMapping
    public ResponseEntity<Page<UserDto>> getRestaurantUsers(Pageable pageable) {
        Page<UserDto> users = userManagementService.getRestaurantUsers(pageable);
        return ResponseEntity.ok(users);
    }
    
    @Operation(summary = "Get user by ID", description = "Get user details (ADMIN only)")
    @GetMapping("/{id}")
    public ResponseEntity<UserDto> getUserById(@PathVariable Long id) {
        UserDto user = userManagementService.getUserById(id);
        return ResponseEntity.ok(user);
    }
    
    @Operation(summary = "Create worker", description = "Create REGULAR_WORKER for the restaurant (ADMIN only)")
    @PostMapping
    public ResponseEntity<UserDto> createWorker(
        @Valid @RequestBody CreateAdminRequest request
    ) {
        UserDto user = userManagementService.createWorker(request);
        return ResponseEntity.ok(user);
    }
    
    @Operation(summary = "Update user", description = "Update worker: name, permissions, optional new password (ADMIN / UPDATE_USERS)")
    @PatchMapping("/{id}")
    public ResponseEntity<UserDto> updateUser(
        @PathVariable Long id,
        @RequestBody UpdateWorkerRequest request
    ) {
        UserDto user = userManagementService.updateUser(id, request);
        return ResponseEntity.ok(user);
    }
    
    @Operation(summary = "Activate user", description = "Activate user account (ADMIN only)")
    @PatchMapping("/{id}/activate")
    public ResponseEntity<UserDto> activateUser(@PathVariable Long id) {
        UserDto user = userManagementService.activateUser(id);
        return ResponseEntity.ok(user);
    }
    
    @Operation(summary = "Deactivate user", description = "Deactivate user account (ADMIN only, cannot deactivate ADMIN or self)")
    @PatchMapping("/{id}/deactivate")
    public ResponseEntity<UserDto> deactivateUser(@PathVariable Long id) {
        UserDto user = userManagementService.deactivateUser(id);
        return ResponseEntity.ok(user);
    }
}

