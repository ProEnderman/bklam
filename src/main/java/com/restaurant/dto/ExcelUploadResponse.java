package com.restaurant.dto;

import java.util.List;

public record ExcelUploadResponse(
    int processedCount,
    int createdCount,
    int updatedCount,
    List<ExcelUploadError> errors,
    boolean hasErrors
) {
    public static ExcelUploadResponse success(int processed, int created, int updated) {
        return new ExcelUploadResponse(processed, created, updated, List.of(), false);
    }
    
    public static ExcelUploadResponse withErrors(int processed, int created, int updated, List<ExcelUploadError> errors) {
        return new ExcelUploadResponse(processed, created, updated, errors, !errors.isEmpty());
    }
}

