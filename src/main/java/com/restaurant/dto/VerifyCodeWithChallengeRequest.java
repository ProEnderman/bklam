package com.restaurant.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record VerifyCodeWithChallengeRequest(
    @NotBlank(message = "Challenge ID is required")
    String challengeId,
    
    @NotBlank(message = "Code is required")
    @Pattern(regexp = "^\\d{6}$", message = "Code must be 6 digits")
    String code
) {}

