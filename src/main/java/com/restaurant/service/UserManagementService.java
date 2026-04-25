package com.restaurant.service;

import com.restaurant.dto.CreateAdminRequest;
import com.restaurant.dto.UpdateWorkerRequest;
import com.restaurant.dto.UserDto;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Role;
import com.restaurant.model.User;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.UserRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserManagementService {
    
    private final UserRepository userRepository;
    private final RestaurantRepository restaurantRepository;
    private final PasswordEncoder passwordEncoder;
    private final ActivityLogService activityLogService;
    
    @Transactional(readOnly = true)
    public Page<UserDto> getRestaurantUsers(Pageable pageable) {
        log.debug("Getting restaurant users");
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.VIEW_USERS)) {
            throw new BusinessException("You don't have permission to view users");
        }
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }
        
        return userRepository.findByRestaurant_Id(restaurantId, pageable)
            .map(UserDto::fromEntity);
    }
    
    @Transactional(readOnly = true)
    public UserDto getUserById(Long id) {
        log.debug("Getting user by id: {}", id);
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.VIEW_USERS)) {
            throw new BusinessException("You don't have permission to view users");
        }
        
        User user = userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + id));
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(user.getRestaurantId())) {
            throw new BusinessException("Access denied to this user");
        }
        
        return UserDto.fromEntity(user);
    }
    
    @Transactional
    public UserDto createWorker(CreateAdminRequest request) {
        log.info("Creating REGULAR_WORKER: {}", request.email());
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.CREATE_WORKERS)) {
            throw new BusinessException("You don't have permission to create workers");
        }
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }
        
        if (userRepository.existsByUsername(request.email())) {
            throw new BusinessException("User with email '" + request.email() + "' already exists");
        }
        
        var restaurant = restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found"));
        
        User user = new User();
        user.setUsername(request.email());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(Role.REGULAR_WORKER); // ADMIN может создавать только REGULAR_WORKER
        user.setRestaurant(restaurant);
        user.setFirstName(request.firstName());
        user.setLastName(request.lastName());
        user.setIsActive(true);
        // Устанавливаем права, если они указаны
        if (request.permissions() != null && !request.permissions().isEmpty()) {
            user.setPermissions(request.permissions());
        }
        
        User saved = userRepository.save(user);
        
        log.info("Created REGULAR_WORKER with id: {}", saved.getId());
        
        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "CREATE",
            "USER",
            saved.getId(),
            username,
            String.format("Создан работник: %s", saved.getUsername()),
            null,
            Map.of("username", saved.getUsername(), "role", saved.getRole().toString(),
                   "restaurantId", restaurantId)
        );
        } catch (Exception e) {
            log.error("Failed to log worker creation activity: {}", e.getMessage());
        }
        
        return UserDto.fromEntity(saved);
    }
    
    @Transactional
    public UserDto updateUser(Long id, UpdateWorkerRequest request) {
        log.info("Updating user id: {}", id);
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.UPDATE_USERS)) {
            throw new BusinessException("You don't have permission to update users");
        }
        
        User user = userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + id));
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(user.getRestaurantId())) {
            throw new BusinessException("Access denied to this user");
        }
        
        if (request == null) {
            throw new BusinessException("Тело запроса обязательно");
        }
        
        boolean hasAny = request.getFirstName() != null
            || request.getLastName() != null
            || request.getPermissions() != null
            || (request.getNewPassword() != null && !request.getNewPassword().isBlank());
        if (!hasAny) {
            throw new BusinessException("Укажите хотя бы одно поле для изменения");
        }
        
        Map<String, Object> oldValues = new java.util.HashMap<>();
        oldValues.put("firstName", user.getFirstName() != null ? user.getFirstName() : "");
        oldValues.put("lastName", user.getLastName() != null ? user.getLastName() : "");
        if (user.getRole() == Role.REGULAR_WORKER) {
            oldValues.put("permissions", user.getPermissions() != null ? user.getPermissions() : java.util.List.of());
            oldValues.put("permissionsCount", user.getPermissions() != null ? user.getPermissions().size() : 0);
        }
        
        if (request.getFirstName() != null) {
            user.setFirstName(request.getFirstName());
        }
        if (request.getLastName() != null) {
            user.setLastName(request.getLastName());
        }
        if (request.getPermissions() != null) {
            if (user.getRole() != Role.REGULAR_WORKER) {
                throw new BusinessException("Список разрешений можно задавать только для сотрудников (REGULAR_WORKER)");
            }
            user.setPermissions(new java.util.ArrayList<>(request.getPermissions()));
        }
        if (request.getNewPassword() != null && !request.getNewPassword().isBlank()) {
            String np = request.getNewPassword();
            if (np.length() < 8) {
                throw new BusinessException("Пароль должен быть не короче 8 символов");
            }
            user.setPasswordHash(passwordEncoder.encode(np));
        }
        
        User saved = userRepository.save(user);
        
        log.info("Updated user id: {}", saved.getId());
        
        Map<String, Object> newValues = new java.util.HashMap<>();
        newValues.put("firstName", saved.getFirstName() != null ? saved.getFirstName() : "");
        newValues.put("lastName", saved.getLastName() != null ? saved.getLastName() : "");
        if (saved.getRole() == Role.REGULAR_WORKER) {
            newValues.put("permissions", saved.getPermissions() != null ? saved.getPermissions() : java.util.List.of());
            newValues.put("permissionsCount", saved.getPermissions() != null ? saved.getPermissions().size() : 0);
        }
        if (request.getNewPassword() != null && !request.getNewPassword().isBlank()) {
            newValues.put("passwordChanged", true);
        }
        
        try {
            activityLogService.logActivity(
                "UPDATE",
                "USER",
                saved.getId(),
                SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system",
                String.format("Обновлен пользователь: %s", saved.getUsername()),
                oldValues,
                newValues
            );
        } catch (Exception e) {
            log.error("Failed to log user update activity: {}", e.getMessage());
        }
        
        return UserDto.fromEntity(saved);
    }
    
    @Transactional
    public UserDto activateUser(Long id) {
        log.info("Activating user id: {}", id);
        return setUserActive(id, true);
    }
    
    @Transactional
    public UserDto deactivateUser(Long id) {
        log.info("Deactivating user id: {}", id);
        return setUserActive(id, false);
    }
    
    private UserDto setUserActive(Long id, boolean active) {
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.ACTIVATE_DEACTIVATE_USERS)) {
            throw new BusinessException("You don't have permission to activate/deactivate users");
        }
        
        User user = userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + id));
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(user.getRestaurantId())) {
            throw new BusinessException("Access denied to this user");
        }
        
        // ADMIN не может деактивировать сам себя
        String currentUsername = SecurityUtils.getCurrentUser() != null ? 
            SecurityUtils.getCurrentUser().getUsername() : null;
        if (currentUsername != null && currentUsername.equals(user.getUsername())) {
            throw new BusinessException("Cannot deactivate yourself");
        }
        
        // ADMIN не может деактивировать других ADMIN
        if (user.getRole() == Role.ADMIN) {
            throw new BusinessException("Cannot deactivate ADMIN users");
        }
        
        boolean oldActive = user.getIsActive();
        user.setIsActive(active);
        User saved = userRepository.save(user);
        
        log.info("User {} {}: userId={}", active ? "activated" : "deactivated", saved.getId());
        
        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            active ? "ACTIVATE" : "DEACTIVATE",
            "USER",
            saved.getId(),
            username,
            String.format("Пользователь %s: %s", active ? "активирован" : "деактивирован", saved.getUsername()),
            Map.of("isActive", oldActive),
            Map.of("isActive", active)
        );
        } catch (Exception e) {
            log.error("Failed to log user activation/deactivation activity: {}", e.getMessage());
        }
        
        return UserDto.fromEntity(saved);
    }
}

