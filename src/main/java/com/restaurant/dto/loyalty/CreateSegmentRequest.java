package com.restaurant.dto.loyalty;

import jakarta.validation.constraints.NotBlank;

public record CreateSegmentRequest(
    @NotBlank String name,
    String definition
) {}
