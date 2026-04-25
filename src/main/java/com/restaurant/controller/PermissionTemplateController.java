package com.restaurant.controller;

import com.restaurant.dto.PermissionTemplateDto;
import com.restaurant.dto.UpsertPermissionTemplateRequest;
import com.restaurant.service.PermissionTemplateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Permission templates", description = "Шаблоны разрешений для сотрудников (в рамках ресторана)")
@RestController
@RequestMapping("/api/permission-templates")
@RequiredArgsConstructor
public class PermissionTemplateController {

    private final PermissionTemplateService permissionTemplateService;

    @Operation(summary = "Список шаблонов")
    @GetMapping
    public ResponseEntity<List<PermissionTemplateDto>> list() {
        return ResponseEntity.ok(permissionTemplateService.listForCurrentRestaurant());
    }

    @Operation(summary = "Создать шаблон")
    @PostMapping
    public ResponseEntity<PermissionTemplateDto> create(@Valid @RequestBody UpsertPermissionTemplateRequest body) {
        return ResponseEntity.ok(permissionTemplateService.create(body));
    }

    @Operation(summary = "Обновить шаблон")
    @PatchMapping("/{id}")
    public ResponseEntity<PermissionTemplateDto> update(
        @PathVariable Long id,
        @Valid @RequestBody UpsertPermissionTemplateRequest body
    ) {
        return ResponseEntity.ok(permissionTemplateService.update(id, body));
    }

    @Operation(summary = "Удалить шаблон")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        permissionTemplateService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
