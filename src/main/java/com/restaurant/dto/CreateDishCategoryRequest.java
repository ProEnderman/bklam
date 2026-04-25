package com.restaurant.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateDishCategoryRequest(
    @NotBlank(message = "Name is required")
    String name
) {}


