package com.restaurant.dto;

import com.restaurant.model.PermissionTemplate;
import com.restaurant.model.UserPermission;

import java.time.LocalDateTime;
import java.util.List;

public record PermissionTemplateDto(
    Long id,
    Long restaurantId,
    String name,
    String description,
    List<UserPermission> permissions,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static PermissionTemplateDto fromEntity(PermissionTemplate t) {
        return new PermissionTemplateDto(
            t.getId(),
            t.getRestaurant() != null ? t.getRestaurant().getId() : null,
            t.getName(),
            t.getDescription(),
            t.getPermissions() != null ? t.getPermissions() : List.of(),
            t.getCreatedAt(),
            t.getUpdatedAt()
        );
    }
}
