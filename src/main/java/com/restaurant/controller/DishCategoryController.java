package com.restaurant.controller;

import com.restaurant.dto.CreateDishCategoryRequest;
import com.restaurant.dto.DishCategoryDto;
import com.restaurant.service.DishCategoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Tag(name = "Dish Categories", description = "API for managing dish categories")
@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class DishCategoryController {
    
    private final DishCategoryService categoryService;
    
    @Operation(summary = "Get all categories", description = "Get list of all dish categories")
    @GetMapping
    public ResponseEntity<List<DishCategoryDto>> getAllCategories() {
        return ResponseEntity.ok(categoryService.getAllCategories());
    }
    
    @Operation(summary = "Get category by ID", description = "Get dish category by ID")
    @GetMapping("/{id}")
    public ResponseEntity<DishCategoryDto> getCategoryById(@PathVariable Long id) {
        return ResponseEntity.ok(categoryService.getCategoryById(id));
    }

    @Operation(summary = "Get category image", description = "Returns the category image file")
    @GetMapping(value = "/{id}/image", produces = { MediaType.IMAGE_PNG_VALUE, MediaType.IMAGE_JPEG_VALUE, "image/webp" })
    public ResponseEntity<Resource> getCategoryImage(@PathVariable Long id) {
        Resource resource = categoryService.getCategoryImage(id);
        String filename = resource.getFilename();
        MediaType mediaType = filename != null && filename.toLowerCase().endsWith(".png")
            ? MediaType.IMAGE_PNG
            : MediaType.IMAGE_JPEG;
        return ResponseEntity.ok()
            .contentType(mediaType)
            .body(resource);
    }
    
    @Operation(summary = "Create category", description = "Create a new dish category")
    @PostMapping
    public ResponseEntity<DishCategoryDto> createCategory(
        @Valid @RequestBody CreateDishCategoryRequest request
    ) {
        return ResponseEntity.ok(categoryService.createCategory(request));
    }
    
    @Operation(summary = "Update category", description = "Update dish category")
    @PutMapping("/{id}")
    public ResponseEntity<DishCategoryDto> updateCategory(
        @PathVariable Long id,
        @Valid @RequestBody CreateDishCategoryRequest request
    ) {
        return ResponseEntity.ok(categoryService.updateCategory(id, request));
    }
    
    @Operation(summary = "Upload category image", description = "Upload PNG image for category")
    @PostMapping(value = "/{id}/image", consumes = "multipart/form-data")
    public ResponseEntity<DishCategoryDto> uploadImage(
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
        
        String imageUrl = categoryService.saveCategoryImage(id, file);
        return ResponseEntity.ok(categoryService.getCategoryById(id));
    }
    
    @Operation(summary = "Delete category", description = "Delete dish category")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCategory(@PathVariable Long id) {
        categoryService.deleteCategory(id);
        return ResponseEntity.noContent().build();
    }
}

