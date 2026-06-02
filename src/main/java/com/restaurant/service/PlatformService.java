package com.restaurant.service;

import com.restaurant.audit.AuditActions;
import com.restaurant.audit.StructuredAudit;
import com.restaurant.dto.CreateAdminRequest;
import com.restaurant.dto.CreateRestaurantRequest;
import com.restaurant.dto.RestaurantDto;
import com.restaurant.dto.UserDto;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Restaurant;
import com.restaurant.model.Role;
import com.restaurant.model.User;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.UserRepository;
import com.restaurant.security.SecurityUtils;
import com.restaurant.util.AuthInputNormalizer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class PlatformService {
    
    private final RestaurantRepository restaurantRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ActivityLogService activityLogService;
    
    // ========== Управление ресторанами ==========
    
    public Page<RestaurantDto> getAllRestaurants(Pageable pageable) {
        log.debug("Getting all restaurants");
        if (!SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("Only HEAD_ADMIN can view all restaurants");
        }
        return restaurantRepository.findAll(pageable).map(RestaurantDto::fromEntity);
    }
    
    public RestaurantDto getRestaurantById(Long id) {
        log.debug("Getting restaurant by id: {}", id);
        if (!SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("Only HEAD_ADMIN can view restaurant details");
        }
        Restaurant restaurant = restaurantRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found with id: " + id));
        return RestaurantDto.fromEntity(restaurant);
    }
    
    @Transactional
    public RestaurantDto createRestaurant(CreateRestaurantRequest request) {
        log.info("Creating restaurant: {}", request.name());
        if (!SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("Only HEAD_ADMIN can create restaurants");
        }
        
        if (restaurantRepository.existsByNameIgnoreCase(request.name())) {
            throw new BusinessException("Restaurant with name '" + request.name() + "' already exists");
        }
        
        Restaurant restaurant = new Restaurant();
        restaurant.setName(request.name());
        restaurant.setTelegramBotToken(normalizeBotToken(request.telegramBotToken()));
        Restaurant saved = restaurantRepository.save(restaurant);
        
        log.info("Created restaurant with id: {}", saved.getId());
        
        // Логирование активности в отдельной транзакции
        // Если логирование не удастся, это не должно откатить создание ресторана
        try {
            String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "CREATE",
                "RESTAURANT",
                saved.getId(),
                username,
                String.format("Создан ресторан: %s", saved.getName()),
                null,
                Map.of("name", saved.getName())
            );
        } catch (Exception e) {
            // Логируем ошибку, но не прерываем транзакцию
            log.error("Failed to log restaurant creation activity: {}", e.getMessage());
        }

        try {
            HashMap<String, Object> audit = new HashMap<>();
            audit.put("entityType", "RESTAURANT");
            audit.put("entityId", saved.getId());
            Long actor = SecurityUtils.getCurrentUserId();
            if (actor != null) {
                audit.put("actorUserId", actor);
            }
            StructuredAudit.success(AuditActions.PLATFORM_RESTAURANT_CREATED, audit);
        } catch (RuntimeException ignored) {
        }
        
        return RestaurantDto.fromEntity(saved);
    }
    
    @Transactional
    public RestaurantDto updateRestaurant(Long id, CreateRestaurantRequest request) {
        log.info("Updating restaurant id: {}", id);
        if (!SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("Only HEAD_ADMIN can update restaurants");
        }
        
        Restaurant restaurant = restaurantRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found with id: " + id));
        
        if (!restaurant.getName().equalsIgnoreCase(request.name()) &&
            restaurantRepository.existsByNameIgnoreCase(request.name())) {
            throw new BusinessException("Restaurant with name '" + request.name() + "' already exists");
        }
        
        String oldName = restaurant.getName();
        restaurant.setName(request.name());
        if (request.telegramBotToken() != null) {
            restaurant.setTelegramBotToken(normalizeBotToken(request.telegramBotToken()));
        }
        Restaurant saved = restaurantRepository.save(restaurant);
        
        log.info("Updated restaurant id: {}", saved.getId());
        
        // Логирование активности в отдельной транзакции
        try {
            String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "UPDATE",
                "RESTAURANT",
                saved.getId(),
                username,
                String.format("Обновлен ресторан: %s", saved.getName()),
                Map.of("name", oldName),
                Map.of("name", saved.getName())
            );
        } catch (Exception e) {
            log.error("Failed to log restaurant update activity: {}", e.getMessage());
        }
        
        return RestaurantDto.fromEntity(saved);
    }
    
    @Transactional
    public void deleteRestaurant(Long id) {
        log.info("Deleting restaurant id: {}", id);
        if (!SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("Only HEAD_ADMIN can delete restaurants");
        }
        
        Restaurant restaurant = restaurantRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found with id: " + id));
        
        userRepository.deleteByRestaurant_Id(id);
        String restaurantName = restaurant.getName();
        restaurantRepository.deleteById(id);
        
        log.info("Deleted restaurant id: {}", id);
        
        // Логирование активности в отдельной транзакции
        try {
            String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "DELETE",
                "RESTAURANT",
                id,
                username,
                String.format("Удален ресторан: %s", restaurantName),
                Map.of("name", restaurantName),
                null
            );
        } catch (Exception e) {
            log.error("Failed to log restaurant delete activity: {}", e.getMessage());
        }
    }
    
    // ========== Управление пользователями ==========
    
    @Transactional
    public UserDto createAdminForRestaurant(Long restaurantId, CreateAdminRequest request) {
        log.info("Creating ADMIN for restaurant id: {}, email: {}", restaurantId, request.email());
        if (!SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("Only HEAD_ADMIN can create admins");
        }

        String email = AuthInputNormalizer.normalizeLoginIdentifierForLookup(request.email());
        if (email == null) {
            throw new BusinessException("Invalid email format");
        }

        Restaurant restaurant = restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found with id: " + restaurantId));

        log.debug("Restaurant found: {}", restaurant.getName());

        if (userRepository.existsByUsername(email)) {
            log.warn("User with email '{}' already exists", email);
            throw new BusinessException("User with email '" + email + "' already exists");
        }

        User user = new User();
        user.setUsername(email);
        user.setPasswordHash(passwordEncoder.encode(AuthInputNormalizer.stripNulCharsFromPassword(request.password())));
        user.setRole(Role.ADMIN);
        user.setRestaurant(restaurant);
        user.setFirstName(request.firstName());
        user.setLastName(request.lastName());
        user.setIsActive(true);
        
        log.debug("Saving user: email={}, firstName={}, lastName={}, role={}, restaurantId={}", 
            user.getUsername(), user.getFirstName(), user.getLastName(), user.getRole(), restaurantId);
        
        User saved = userRepository.save(user);
        
        log.info("Created ADMIN with id: {} for restaurant: {}", saved.getId(), restaurant.getName());
        
        // Логирование активности в отдельной транзакции
        try {
            String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "CREATE",
                "USER",
                saved.getId(),
                username,
                String.format("Создан ADMIN: %s для ресторана: %s", saved.getUsername(), restaurant.getName()),
                null,
                Map.of("username", saved.getUsername(), "role", saved.getRole().toString(),
                       "restaurantId", restaurantId)
            );
        } catch (Exception e) {
            log.error("Failed to log admin creation activity: {}", e.getMessage(), e);
        }

        try {
            HashMap<String, Object> audit = new HashMap<>();
            audit.put("entityType", "USER");
            audit.put("entityId", saved.getId());
            audit.put("restaurantId", restaurantId);
            Long actor = SecurityUtils.getCurrentUserId();
            if (actor != null) {
                audit.put("actorUserId", actor);
            }
            StructuredAudit.success(AuditActions.PLATFORM_ADMIN_CREATED, audit);
        } catch (RuntimeException ignored) {
        }
        
        UserDto result = UserDto.fromEntity(saved);
        log.debug("Returning UserDto: id={}, username={}, role={}", result.id(), result.username(), result.role());
        return result;
    }
    
    public Page<UserDto> getAllUsers(Long restaurantId, Pageable pageable) {
        log.debug("Getting all users, restaurantId: {}", restaurantId);
        if (!SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("Only HEAD_ADMIN can view all users");
        }
        
        Page<User> users;
        if (restaurantId != null) {
            users = userRepository.findByRestaurant_Id(restaurantId, pageable);
        } else {
            users = userRepository.findAll(pageable);
        }
        
        return users.map(UserDto::fromEntity);
    }
    
    @Transactional
    public UserDto updateUserRole(Long userId, Role newRole) {
        log.info("Updating user role: userId={}, newRole={}", userId, newRole);
        if (!SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("Only HEAD_ADMIN can change user roles");
        }
        
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found with id: " + userId));
        
        Role oldRole = user.getRole();
        
        // HEAD_ADMIN не может быть изменен через API
        if (oldRole == Role.HEAD_ADMIN || newRole == Role.HEAD_ADMIN) {
            throw new BusinessException("Cannot change HEAD_ADMIN role");
        }
        
        user.setRole(newRole);
        User saved = userRepository.save(user);
        
        log.info("Updated user role: userId={}, {} -> {}", userId, oldRole, newRole);
        
        // Логирование активности в отдельной транзакции
        try {
            String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "UPDATE_ROLE",
                "USER",
                saved.getId(),
                username,
                String.format("Изменена роль пользователя: %s, %s -> %s", 
                    saved.getUsername(), oldRole, newRole),
                Map.of("role", oldRole.toString()),
                Map.of("role", newRole.toString())
            );
        } catch (Exception e) {
            log.error("Failed to log user role update activity: {}", e.getMessage());
        }

        try {
            HashMap<String, Object> audit = new HashMap<>();
            audit.put("entityType", "USER");
            audit.put("entityId", saved.getId());
            audit.put("oldRole", oldRole.name());
            audit.put("newRole", newRole.name());
            Long actor = SecurityUtils.getCurrentUserId();
            if (actor != null) {
                audit.put("actorUserId", actor);
            }
            StructuredAudit.success(AuditActions.PLATFORM_USER_ROLE_CHANGED, audit);
        } catch (RuntimeException ignored) {
        }
        
        return UserDto.fromEntity(saved);
    }

    private String normalizeBotToken(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

