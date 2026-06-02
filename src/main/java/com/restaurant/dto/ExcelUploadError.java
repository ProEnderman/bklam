package com.restaurant.dto;

import com.restaurant.model.Unit;

public record ExcelUploadError(
    String item,
    String type, // "UNIT_MISMATCH" | "UNIT_MISSING" | "INGREDIENT_MISSING" | ...
    Unit existingUnit, // null если товар не существует
    Unit providedUnit, // null если unit не указан
    int rowNumber
) {}

