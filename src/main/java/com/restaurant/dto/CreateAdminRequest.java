package com.restaurant.dto;

import com.restaurant.model.UserPermission;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateAdminRequest(
    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    String email,
    
    @NotBlank(message = "Password is required")
    @Size(min = 8, message = "Password must be at least 8 characters")
    String password,
    
    String firstName,
    String lastName,
    
    // Права для REGULAR_WORKER (опционально, только для создания worker)
    List<UserPermission> permissions
) {}

