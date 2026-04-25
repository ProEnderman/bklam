package com.restaurant.dto;

import com.restaurant.model.Role;
import com.restaurant.model.User;
import com.restaurant.model.UserPermission;

import java.time.LocalDateTime;
import java.util.List;

public record UserDto(
    Long id,
    String username,
    Role role,
    Long restaurantId,
    String restaurantName,
    String firstName,
    String lastName,
    Boolean isActive,
    List<UserPermission> permissions,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static UserDto fromEntity(User user) {
        return new UserDto(
            user.getId(),
            user.getUsername(),
            user.getRole(),
            user.getRestaurantId(),
            user.getRestaurant() != null ? user.getRestaurant().getName() : null,
            user.getFirstName(),
            user.getLastName(),
            user.getIsActive(),
            user.getPermissions() != null ? user.getPermissions() : List.of(),
            user.getCreatedAt(),
            user.getUpdatedAt()
        );
    }
}

