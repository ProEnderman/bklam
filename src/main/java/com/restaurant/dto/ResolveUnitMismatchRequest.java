package com.restaurant.dto;

import com.restaurant.model.Unit;

public record ResolveUnitMismatchRequest(
    String item,
    Unit chosenUnit,
    boolean updateExisting
) {}

