package com.restaurant.dto;

import com.restaurant.model.Unit;

public record ExcelUploadRow(
    String item,
    Double quantity,
    Unit unit,
    Double minQty,
    /** 1-based row number in the spreadsheet (for errors), or null if unknown */
    Integer spreadsheetRowNumber
) {
    public ExcelUploadRow(String item, Double quantity, Unit unit, Double minQty) {
        this(item, quantity, unit, minQty, null);
    }
}

