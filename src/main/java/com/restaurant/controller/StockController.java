package com.restaurant.controller;

import com.restaurant.dto.*;
import com.restaurant.model.StockMovementReason;
import com.restaurant.model.StockMovementType;
import com.restaurant.service.ExcelUploadService;
import com.restaurant.service.IngredientService;
import com.restaurant.service.StockService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import com.restaurant.service.RestaurantDataExportService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Tag(name = "Stock", description = "Stock movements and inventory management")
@RestController
@RequestMapping("/api/stock")
@RequiredArgsConstructor
public class StockController {
    
    private final StockService stockService;
    private final IngredientService ingredientService;
    private final ExcelUploadService excelUploadService;
    private final RestaurantDataExportService restaurantDataExportService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    @Operation(summary = "Stock IN - Add stock")
    @PostMapping("/in")
    public ResponseEntity<StockMovementDto> stockIn(@Valid @RequestBody StockInRequest request) {
        StockMovementDto movement = stockService.stockIn(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(movement);
    }
    
    @Operation(summary = "Stock OUT - Remove stock")
    @PostMapping("/out")
    public ResponseEntity<StockMovementDto> stockOut(@Valid @RequestBody StockOutRequest request) {
        StockMovementDto movement = stockService.stockOut(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(movement);
    }
    
    @Operation(summary = "Get stock movements history")
    @GetMapping("/movements")
    public ResponseEntity<Page<StockMovementDto>> getMovements(
        @RequestParam(required = false) Long ingredientId,
        @RequestParam(required = false) StockMovementType type,
        @RequestParam(required = false) StockMovementReason reason,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromDate, // для обратной совместимости
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toDate, // для обратной совместимости
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size);
        LocalDateTime fromDateTime = from != null ? from : fromDate;
        LocalDateTime toDateTime = to != null ? to : toDate;
        Page<StockMovementDto> movements = stockService.getMovements(
            ingredientId, type, reason, fromDateTime, toDateTime, pageable
        );
        return ResponseEntity.ok(movements);
    }
    
    @Operation(summary = "Get inventory (alias to ingredients with filters)")
    @GetMapping("/inventory")
    public ResponseEntity<Page<IngredientDto>> getInventory(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) Boolean belowMin,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size);
        Page<IngredientDto> ingredients = ingredientService.getAllIngredients(q, belowMin, pageable);
        return ResponseEntity.ok(ingredients);
    }
    
    @Operation(summary = "Upload Excel for stock IN per row (quantity column = amount to add; not full inventory reconcile)")
    @PostMapping(value = "/upload-excel", consumes = "multipart/form-data")
    public ResponseEntity<ExcelUploadResponse> uploadExcel(
        @RequestParam("file") MultipartFile file,
        @RequestParam(value = "unitMismatchResolutions", required = false) String unitMismatchResolutionsJson,
        @RequestParam(value = "missingUnitResolutions", required = false) String missingUnitResolutionsJson,
        @RequestParam(value = "missingIngredientResolutions", required = false) String missingIngredientResolutionsJson
    ) {
        Map<String, ResolveUnitMismatchRequest> unitMismatchMap = parseUnitMismatchResolutions(unitMismatchResolutionsJson);
        Map<String, com.restaurant.model.Unit> missingUnitMap = parseMissingUnitResolutions(missingUnitResolutionsJson);
        Map<String, ResolveIngredientMissingRequest> missingIngredientMap = parseIngredientMissingResolutions(missingIngredientResolutionsJson);

        ExcelUploadResponse response = excelUploadService.processExcelFile(
            file, unitMismatchMap, missingUnitMap, missingIngredientMap);
        return ResponseEntity.ok(response);
    }

    @Operation(summary = "Export stock movements as CSV (UTF-8 with BOM, current restaurant; for Google Sheets / Excel)")
    @GetMapping(value = "/export-movements-csv", produces = "text/csv; charset=UTF-8")
    public ResponseEntity<byte[]> exportMovementsCsv(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        byte[] csv = restaurantDataExportService.exportStockMovementsCsv(from, to);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDispositionFormData("attachment", "stock_movements.csv");
        headers.setContentType(MediaType.parseMediaType("text/csv; charset=UTF-8"));
        return ResponseEntity.ok().headers(headers).body(csv);
    }

    @Operation(summary = "Download Excel with current stock (name, unit, quantity)")
    @GetMapping(value = "/export-excel", produces = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    public ResponseEntity<byte[]> exportStockExcel() {
        byte[] body = excelUploadService.exportStockToExcel();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        headers.setContentDispositionFormData("attachment", "ingredients-stock.xlsx");
        return ResponseEntity.ok().headers(headers).body(body);
    }
    
    private Map<String, ResolveUnitMismatchRequest> parseUnitMismatchResolutions(String json) {
        Map<String, ResolveUnitMismatchRequest> result = new HashMap<>();
        if (json == null || json.isEmpty() || json.equals("{}")) {
            return result;
        }
        try {
            // Парсим JSON: {"itemName": {"item": "itemName", "chosenUnit": "G", "updateExisting": false}}
            TypeReference<Map<String, ResolveUnitMismatchRequest>> typeRef = 
                new TypeReference<Map<String, ResolveUnitMismatchRequest>>() {};
            result = objectMapper.readValue(json, typeRef);
        } catch (Exception e) {
            // Логируем ошибку, но не прерываем выполнение
            System.err.println("Failed to parse unitMismatchResolutions JSON: " + e.getMessage());
            e.printStackTrace();
        }
        return result;
    }
    
    private Map<String, ResolveIngredientMissingRequest> parseIngredientMissingResolutions(String json) {
        Map<String, ResolveIngredientMissingRequest> result = new HashMap<>();
        if (json == null || json.isEmpty() || json.equals("{}")) {
            return result;
        }
        try {
            TypeReference<Map<String, ResolveIngredientMissingRequest>> typeRef =
                new TypeReference<Map<String, ResolveIngredientMissingRequest>>() {};
            result = objectMapper.readValue(json, typeRef);
        } catch (Exception e) {
            System.err.println("Failed to parse missingIngredientResolutions JSON: " + e.getMessage());
            e.printStackTrace();
        }
        return result;
    }

    private Map<String, com.restaurant.model.Unit> parseMissingUnitResolutions(String json) {
        Map<String, com.restaurant.model.Unit> result = new HashMap<>();
        if (json == null || json.isEmpty() || json.equals("{}")) {
            return result;
        }
        try {
            // Парсим JSON: {"itemName": "G"}
            TypeReference<Map<String, String>> typeRef = new TypeReference<Map<String, String>>() {};
            Map<String, String> stringMap = objectMapper.readValue(json, typeRef);
            
            // Конвертируем строки в Unit enum
            for (Map.Entry<String, String> entry : stringMap.entrySet()) {
                try {
                    com.restaurant.model.Unit unit = com.restaurant.model.Unit.valueOf(entry.getValue());
                    result.put(entry.getKey(), unit);
                } catch (IllegalArgumentException e) {
                    System.err.println("Invalid unit value: " + entry.getValue());
                }
            }
        } catch (Exception e) {
            // Логируем ошибку, но не прерываем выполнение
            System.err.println("Failed to parse missingUnitResolutions JSON: " + e.getMessage());
            e.printStackTrace();
        }
        return result;
    }
}

