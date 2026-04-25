package com.restaurant.dto;

import com.restaurant.model.Unit;

public record ExcelUploadRow(
    String item,
    Double quantity,
    Unit unit,
    Double minQty
) {}

