package com.restaurant.controller;

import com.restaurant.dto.DishDto;
import com.restaurant.dto.DishIngredientDto;
import com.restaurant.dto.UpdateRecipeRequest;
import com.restaurant.service.DishService;
import com.restaurant.web.PaginationConstraints;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Tag(name = "Dishes", description = "CRUD operations for dishes and recipes")
@RestController
@RequestMapping("/api/dishes")
@RequiredArgsConstructor
public class DishController {
    
    private final DishService dishService;
    
    @Operation(summary = "Get all dishes with pagination and search")
    @GetMapping
    public ResponseEntity<Page<DishDto>> getAllDishes(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String search, // для обратной совместимости
        @RequestParam(required = false) Boolean activeOnly,
        @RequestParam(required = false) Boolean isActive, // для обратной совместимости
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PaginationConstraints.pageable(page, size);
        String searchTerm = q != null ? q : search;
        Boolean activeFilter = activeOnly != null ? activeOnly : isActive;
        Page<DishDto> dishes = dishService.getAllDishes(searchTerm, activeFilter, pageable);
        return ResponseEntity.ok(dishes);
    }
    
    @Operation(summary = "Get dishes by category", description = "Get all active dishes for a specific category")
    @GetMapping("/category/{categoryId}")
    public ResponseEntity<List<DishDto>> getDishesByCategory(@PathVariable Long categoryId) {
        return ResponseEntity.ok(dishService.getDishesByCategory(categoryId));
    }
    
    @Operation(summary = "Get dish by ID")
    @GetMapping("/{id}")
    public ResponseEntity<DishDto> getDishById(@PathVariable Long id) {
        DishDto dish = dishService.getDishById(id);
        return ResponseEntity.ok(dish);
    }
    
    @Operation(summary = "Create new dish")
    @PostMapping
    public ResponseEntity<DishDto> createDish(@Valid @RequestBody DishDto dto) {
        DishDto created = dishService.createDish(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Update dish")
    @PutMapping("/{id}")
    public ResponseEntity<DishDto> updateDish(
        @PathVariable Long id,
        @Valid @RequestBody DishDto dto
    ) {
        DishDto updated = dishService.updateDish(id, dto);
        return ResponseEntity.ok(updated);
    }
    
    @Operation(summary = "Delete dish (soft delete)")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteDish(@PathVariable Long id) {
        dishService.deleteDish(id);
        return ResponseEntity.noContent().build();
    }
    
    @Operation(summary = "Get recipe for dish")
    @GetMapping("/{id}/recipe")
    public ResponseEntity<List<DishIngredientDto>> getRecipe(@PathVariable Long id) {
        List<DishIngredientDto> recipe = dishService.getRecipe(id);
        return ResponseEntity.ok(recipe);
    }
    
    @Operation(summary = "Update recipe for dish")
    @PutMapping("/{id}/recipe")
    public ResponseEntity<Void> updateRecipe(
        @PathVariable Long id,
        @Valid @RequestBody UpdateRecipeRequest request
    ) {
        dishService.updateRecipe(id, request);
        return ResponseEntity.ok().build();
    }
    
    @Operation(summary = "Upload dish image", description = "Upload PNG/JPEG image for dish")
    @PostMapping(value = "/{id}/image", consumes = "multipart/form-data")
    public ResponseEntity<DishDto> uploadImage(
        @PathVariable Long id,
        @RequestParam("file") MultipartFile file
    ) {
        if (file.isEmpty()) {
            throw new com.restaurant.exception.BusinessException("File is empty");
        }
        
        // Проверяем тип файла
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new com.restaurant.exception.BusinessException("File must be an image");
        }
        
        String imageUrl = dishService.saveDishImage(id, file);
        return ResponseEntity.ok(dishService.getDishById(id));
    }
}

