package com.restaurant.dto;

import java.time.LocalDateTime;
import java.util.Map;

public record ActivityLogDto(
    Long id,
    String actionType,
    String entityType,
    Long entityId,
    String userName,
    String description,
    Map<String, Object> oldValues,
    Map<String, Object> newValues,
    LocalDateTime createdAt
) {
    public static ActivityLogDto fromEntity(com.restaurant.model.ActivityLog log) {
        return new ActivityLogDto(
            log.getId(),
            log.getActionType(),
            log.getEntityType(),
            log.getEntityId(),
            log.getUserName(),
            log.getDescription(),
            log.getOldValues(),
            log.getNewValues(),
            log.getCreatedAt()
        );
    }
}

