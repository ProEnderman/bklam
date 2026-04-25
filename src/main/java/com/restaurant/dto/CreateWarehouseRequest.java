package com.restaurant.dto;

import com.restaurant.model.WarehouseType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateWarehouseRequest(
    @NotNull Long locationId,
    @NotBlank @Size(max = 255) String name,
    WarehouseType type
) {}
