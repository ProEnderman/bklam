package com.restaurant.dto;

import com.restaurant.model.UserPermission;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record UpsertPermissionTemplateRequest(
    @NotBlank(message = "Название обязательно")
    @Size(max = 120, message = "Название не длиннее 120 символов")
    String name,

    String description,

    List<UserPermission> permissions
) {}
