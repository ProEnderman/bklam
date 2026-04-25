package com.restaurant.controller;

import com.restaurant.dto.IngredientDto;
import com.restaurant.dto.ExcelUploadResponse;
import com.restaurant.service.ExcelUploadService;
import com.restaurant.service.IngredientService;
import com.restaurant.web.PaginationConstraints;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Tag(name = "Ingredients", description = "CRUD operations for ingredients")
@RestController
@RequestMapping("/api/ingredients")
@RequiredArgsConstructor
public class IngredientController {
    
    private final IngredientService ingredientService;
    private final ExcelUploadService excelUploadService;
    
    @Operation(summary = "Get all ingredients with pagination and search")
    @GetMapping
    public ResponseEntity<Page<IngredientDto>> getAllIngredients(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String search, // для обратной совместимости
        @RequestParam(required = false) Boolean belowMin,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PaginationConstraints.pageable(page, size);
        String searchTerm = q != null ? q : search;
        Page<IngredientDto> ingredients = ingredientService.getAllIngredients(searchTerm, belowMin, pageable);
        return ResponseEntity.ok(ingredients);
    }
    
    @Operation(summary = "Get ingredient by ID")
    @GetMapping("/{id}")
    public ResponseEntity<IngredientDto> getIngredientById(@PathVariable Long id) {
        IngredientDto ingredient = ingredientService.getIngredientById(id);
        return ResponseEntity.ok(ingredient);
    }
    
    @Operation(summary = "Create new ingredient")
    @PostMapping
    public ResponseEntity<IngredientDto> createIngredient(@Valid @RequestBody IngredientDto dto) {
        IngredientDto created = ingredientService.createIngredient(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Update ingredient")
    @PutMapping("/{id}")
    public ResponseEntity<IngredientDto> updateIngredient(
        @PathVariable Long id,
        @Valid @RequestBody IngredientDto dto
    ) {
        IngredientDto updated = ingredientService.updateIngredient(id, dto);
        return ResponseEntity.ok(updated);
    }
    
    @Operation(summary = "Delete ingredient")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIngredient(@PathVariable Long id) {
        ingredientService.deleteIngredient(id);
        return ResponseEntity.noContent().build();
    }
    
    @Operation(summary = "Get ingredients below minimum stock")
    @GetMapping("/below-minimum")
    public ResponseEntity<List<IngredientDto>> getIngredientsBelowMinimum() {
        List<IngredientDto> ingredients = ingredientService.getIngredientsBelowMinimum();
        return ResponseEntity.ok(ingredients);
    }

    @Operation(summary = "Upload Excel file for ingredients import (name, unit, minQty)")
    @PostMapping(value = "/upload-excel", consumes = "multipart/form-data")
    public ResponseEntity<ExcelUploadResponse> uploadIngredientsExcel(
        @RequestParam("file") MultipartFile file
    ) {
        ExcelUploadResponse response = excelUploadService.processIngredientsExcelTemplate(file);
        return ResponseEntity.ok(response);
    }
}

