package com.restaurant.service;

import com.restaurant.dto.PermissionTemplateDto;
import com.restaurant.dto.UpsertPermissionTemplateRequest;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.PermissionTemplate;
import com.restaurant.model.UserPermission;
import com.restaurant.repository.PermissionTemplateRepository;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class PermissionTemplateService {

    private final PermissionTemplateRepository permissionTemplateRepository;
    private final RestaurantRepository restaurantRepository;
    private final ActivityLogService activityLogService;

    @Transactional(readOnly = true)
    public List<PermissionTemplateDto> listForCurrentRestaurant() {
        requireViewUsers();
        Long restaurantId = requireRestaurantId();
        return permissionTemplateRepository.findByRestaurant_IdOrderByNameAsc(restaurantId).stream()
            .map(PermissionTemplateDto::fromEntity)
            .toList();
    }

    @Transactional
    public PermissionTemplateDto create(UpsertPermissionTemplateRequest req) {
        requireCreateWorkers();
        Long restaurantId = requireRestaurantId();
        String name = req.name().trim();
        if (permissionTemplateRepository.existsByRestaurant_IdAndNameIgnoreCase(restaurantId, name)) {
            throw new BusinessException("Шаблон с таким названием уже существует");
        }
        var restaurant = restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found"));
        PermissionTemplate t = new PermissionTemplate();
        t.setRestaurant(restaurant);
        t.setName(name);
        t.setDescription(req.description() != null ? req.description().trim() : null);
        t.setPermissions(normalizePermissions(req.permissions()));
        PermissionTemplate saved = permissionTemplateRepository.save(t);
        try {
            String user = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "CREATE",
                "PERMISSION_TEMPLATE",
                saved.getId(),
                user,
                "Создан шаблон прав: " + saved.getName(),
                null,
                Map.of(
                    "name", saved.getName(),
                    "description", saved.getDescription() != null ? saved.getDescription() : "",
                    "permissions", saved.getPermissions()
                )
            );
        } catch (Exception e) {
            log.warn("Failed to log permission template create: {}", e.getMessage());
        }
        return PermissionTemplateDto.fromEntity(saved);
    }

    @Transactional
    public PermissionTemplateDto update(Long id, UpsertPermissionTemplateRequest req) {
        requireUpdateUsers();
        Long restaurantId = requireRestaurantId();
        PermissionTemplate t = permissionTemplateRepository.findByIdAndRestaurant_Id(id, restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Шаблон не найден"));
        var oldValues = Map.<String, Object>of(
            "name", t.getName(),
            "description", t.getDescription() != null ? t.getDescription() : "",
            "permissions", t.getPermissions()
        );
        String name = req.name().trim();
        if (permissionTemplateRepository.existsByRestaurant_IdAndNameIgnoreCaseAndIdNot(restaurantId, name, id)) {
            throw new BusinessException("Шаблон с таким названием уже существует");
        }
        t.setName(name);
        t.setDescription(req.description() != null ? req.description().trim() : null);
        t.setPermissions(normalizePermissions(req.permissions()));
        PermissionTemplate saved = permissionTemplateRepository.save(t);
        try {
            String user = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "UPDATE",
                "PERMISSION_TEMPLATE",
                saved.getId(),
                user,
                "Обновлён шаблон прав: " + saved.getName(),
                oldValues,
                Map.of(
                    "name", saved.getName(),
                    "description", saved.getDescription() != null ? saved.getDescription() : "",
                    "permissions", saved.getPermissions()
                )
            );
        } catch (Exception e) {
            log.warn("Failed to log permission template update: {}", e.getMessage());
        }
        return PermissionTemplateDto.fromEntity(saved);
    }

    @Transactional
    public void delete(Long id) {
        requireUpdateUsers();
        Long restaurantId = requireRestaurantId();
        PermissionTemplate t = permissionTemplateRepository.findByIdAndRestaurant_Id(id, restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Шаблон не найден"));
        var oldValues = Map.<String, Object>of(
            "name", t.getName(),
            "description", t.getDescription() != null ? t.getDescription() : "",
            "permissions", t.getPermissions()
        );
        permissionTemplateRepository.delete(t);
        try {
            String user = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "DELETE",
                "PERMISSION_TEMPLATE",
                id,
                user,
                "Удалён шаблон прав: " + t.getName(),
                oldValues,
                null
            );
        } catch (Exception e) {
            log.warn("Failed to log permission template delete: {}", e.getMessage());
        }
    }

    private static List<UserPermission> normalizePermissions(List<UserPermission> in) {
        if (in == null || in.isEmpty()) {
            return new ArrayList<>();
        }
        return new ArrayList<>(in.stream().distinct().toList());
    }

    private void requireViewUsers() {
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(UserPermission.VIEW_USERS)) {
            throw new BusinessException("Нет права просматривать пользователей и шаблоны");
        }
    }

    private void requireCreateWorkers() {
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(UserPermission.CREATE_WORKERS)) {
            throw new BusinessException("Нет права создавать шаблоны разрешений");
        }
    }

    private void requireUpdateUsers() {
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(UserPermission.UPDATE_USERS)) {
            throw new BusinessException("Нет права изменять шаблоны разрешений");
        }
    }

    private Long requireRestaurantId() {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Не указан ресторан");
        }
        return restaurantId;
    }
}
