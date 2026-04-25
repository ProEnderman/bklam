package com.restaurant.service;

import com.restaurant.model.ActivityLog;
import com.restaurant.repository.ActivityLogRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ActivityLogService {
    
    private final ActivityLogRepository activityLogRepository;
    
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logActivity(
        String actionType,
        String entityType,
        Long entityId,
        String userName,
        String description,
        Map<String, Object> oldValues,
        Map<String, Object> newValues
    ) {
        try {
            ActivityLog activityLog = new ActivityLog();
            activityLog.setActionType(actionType);
            activityLog.setEntityType(entityType);
            activityLog.setEntityId(entityId);
            
            // Безопасное получение имени пользователя
            String finalUserName = userName;
            if (finalUserName == null || finalUserName.isEmpty()) {
                try {
                    finalUserName = SecurityUtils.getCurrentUser() != null ? 
                        SecurityUtils.getCurrentUser().getUsername() : "system";
                } catch (Exception e) {
                    log.warn("Could not get current user for activity log: {}", e.getMessage());
                    finalUserName = "system";
                }
            }
            activityLog.setUserName(finalUserName);
            activityLog.setDescription(description);
            activityLog.setOldValues(oldValues);
            activityLog.setNewValues(newValues);
            
            activityLogRepository.save(activityLog);
        } catch (Exception e) {
            // Не прерываем основную транзакцию при ошибке логирования
            // Логируем ошибку, но не пробрасываем исключение
            log.error("Failed to log activity: {}", e.getMessage(), e);
            // Явно откатываем только транзакцию логирования, не основную
        }
    }
    
    public Page<ActivityLog> getActivities(
        String actionType,
        String entityType,
        Long entityId,
        String userName,
        LocalDateTime fromDate,
        LocalDateTime toDate,
        Pageable pageable
    ) {
        // Преобразуем NULL даты в очень ранние/поздние даты, чтобы избежать проблем с определением типа в PostgreSQL
        LocalDateTime fromDateParam = fromDate != null ? fromDate : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDateParam = toDate != null ? toDate : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        
        return activityLogRepository.findActivities(
            actionType, entityType, entityId, userName, fromDateParam, toDateParam, pageable
        );
    }
    
    @Transactional(readOnly = true)
    public List<String> getDistinctActionTypes() {
        return activityLogRepository.findDistinctActionTypes();
    }
    
    @Transactional(readOnly = true)
    public List<String> getDistinctEntityTypes(String actionType) {
        return activityLogRepository.findDistinctEntityTypes(actionType);
    }
    
    @Transactional(readOnly = true)
    public List<String> getDistinctUserNames(String actionType, String entityType) {
        return activityLogRepository.findDistinctUserNames(actionType, entityType);
    }
}

