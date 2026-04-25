package com.restaurant.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateBrandRequest(
    @NotNull Long holdingId,
    @NotBlank @Size(max = 255) String name
) {}
