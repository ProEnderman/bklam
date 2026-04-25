package com.restaurant.dto;

import com.restaurant.model.Unit;

import java.util.Map;

public record ExcelUploadRequest(
    Map<String, ResolveUnitMismatchRequest> unitMismatchResolutions,
    Map<String, Unit> missingUnitResolutions
) {
    public ExcelUploadRequest() {
        this(Map.of(), Map.of());
    }
}

