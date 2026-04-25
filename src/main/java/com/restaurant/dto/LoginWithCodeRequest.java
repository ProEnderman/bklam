package com.restaurant.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record LoginWithCodeRequest(
    @NotNull(message = "Login credentials are required")
    @Valid
    LoginRequest login,
    
    @NotNull(message = "Verification code is required")
    @Valid
    VerifyCodeRequest verification
) {}

