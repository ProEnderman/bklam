package com.restaurant.dto;

import com.restaurant.model.UserPermission;
import lombok.Data;

import java.util.List;

/**
 * Частичное обновление сотрудника (REGULAR_WORKER): только переданные поля применяются.
 */
@Data
public class UpdateWorkerRequest {
    private String firstName;
    private String lastName;
    private List<UserPermission> permissions;
    /** Если задан и не пустой — смена пароля (минимум 8 символов, проверка в сервисе). */
    private String newPassword;
}
