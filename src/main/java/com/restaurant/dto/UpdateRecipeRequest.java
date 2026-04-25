package com.restaurant.dto;

import jakarta.validation.Valid;

import java.util.List;

public record UpdateRecipeRequest(
    @Valid List<RecipeItem> ingredients
) {}

