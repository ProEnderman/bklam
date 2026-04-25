package com.restaurant.controller;

import com.restaurant.dto.ActivityLogDto;
import com.restaurant.service.ActivityLogService;
import com.restaurant.service.RestaurantDataExportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Tag(name = "Activity Log", description = "История действий в системе")
@RestController
@RequestMapping("/api/activity-log")
@RequiredArgsConstructor
public class ActivityLogController {
    
    private final ActivityLogService activityLogService;
    private final RestaurantDataExportService restaurantDataExportService;
    
    @Operation(summary = "Получить историю действий", description = "Получить историю всех действий в системе с фильтрами")
    @GetMapping
    public Page<ActivityLogDto> getActivities(
        @RequestParam(required = false) String actionType,
        @RequestParam(required = false) String entityType,
        @RequestParam(required = false) Long entityId,
        @RequestParam(required = false) String userName,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toDate,
        Pageable pageable
    ) {
        return activityLogService.getActivities(
            actionType, entityType, entityId, userName, fromDate, toDate, pageable
        ).map(ActivityLogDto::fromEntity);
    }
    
    @Operation(summary = "Уникальные типы действий")
    @GetMapping("/action-types")
    public List<String> getActionTypes() {
        return activityLogService.getDistinctActionTypes();
    }
    
    @Operation(summary = "Уникальные типы сущностей (с опциональной фильтрацией по действию)")
    @GetMapping("/entity-types")
    public List<String> getEntityTypes(@RequestParam(required = false) String actionType) {
        return activityLogService.getDistinctEntityTypes(actionType);
    }
    
    @Operation(summary = "Уникальные имена пользователей (с опциональной фильтрацией)")
    @GetMapping("/user-names")
    public List<String> getUserNames(
        @RequestParam(required = false) String actionType,
        @RequestParam(required = false) String entityType
    ) {
        return activityLogService.getDistinctUserNames(actionType, entityType);
    }

    @Operation(summary = "Экспорт журнала действий в CSV (для Excel / Google Таблиц)")
    @GetMapping(value = "/export-csv", produces = "text/csv; charset=UTF-8")
    public ResponseEntity<byte[]> exportCsv(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        byte[] csv = restaurantDataExportService.exportActivityLogCsv(from, to);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDispositionFormData("attachment", "activity_log.csv");
        headers.setContentType(MediaType.parseMediaType("text/csv; charset=UTF-8"));
        return ResponseEntity.ok().headers(headers).body(csv);
    }
}

