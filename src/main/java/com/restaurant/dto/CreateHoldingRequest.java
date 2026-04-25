package com.restaurant.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateHoldingRequest(
    @NotBlank @Size(max = 255) String name
) {}
