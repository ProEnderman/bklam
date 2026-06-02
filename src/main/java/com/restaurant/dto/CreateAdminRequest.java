package com.restaurant.dto;

import com.restaurant.model.UserPermission;
import com.restaurant.util.AuthInputNormalizer;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateAdminRequest(
    @NotBlank(message = "Email is required")
    @Size(max = AuthInputNormalizer.MAX_LOGIN_IDENTIFIER_LENGTH, message = "Email is too long")
    @Email(message = "Invalid email format")
    String email,

    @NotBlank(message = "Password is required")
    @Size(min = 8, max = AuthInputNormalizer.MAX_PASSWORD_CHAR_LENGTH, message = "Password must be between 8 and 128 characters")
    String password,
    
    String firstName,
    String lastName,
    
    // Права для REGULAR_WORKER (опционально, только для создания worker)
    List<UserPermission> permissions
) {}

