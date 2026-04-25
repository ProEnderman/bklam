package com.restaurant.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
    @NotBlank(message = "Email or username is required")
    String email, // На самом деле это username, но оставляем название email для обратной совместимости
    
    @NotBlank(message = "Password is required")
    String password
) {}

