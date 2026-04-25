package com.restaurant.service;

import com.restaurant.dto.IngredientDto;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Ingredient;
import com.restaurant.repository.IngredientRepository;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class IngredientService {
    
    private final IngredientRepository ingredientRepository;
    private final RestaurantRepository restaurantRepository;
    private final ActivityLogService activityLogService;
    
    private Long getRestaurantId() {
        if (SecurityUtils.isHeadAdmin()) {
            return null; // HEAD_ADMIN видит все
        }
        return SecurityUtils.getCurrentRestaurantId();
    }
    
    public Page<IngredientDto> getAllIngredients(String search, Boolean belowMin, Pageable pageable) {
        log.debug("Getting ingredients with search: {}, belowMin: {}", search, belowMin);
        
        // REGULAR_WORKER должен иметь право VIEW_INGREDIENTS
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.VIEW_INGREDIENTS)) {
            throw new BusinessException("You don't have permission to view ingredients");
        }
        
        Long restaurantId = getRestaurantId();
        // Преобразуем Boolean в String для native SQL запроса
        String belowMinStr = belowMin != null ? belowMin.toString() : null;
        Page<Ingredient> ingredients = ingredientRepository.searchIngredients(
            restaurantId, search, belowMinStr, pageable
        );
        return ingredients.map(IngredientDto::fromEntity);
    }
    
    public IngredientDto getIngredientById(Long id) {
        log.debug("Getting ingredient by id: {}", id);
        Ingredient ingredient = ingredientRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Ingredient not found with id: " + id));
        
        // Проверка прав доступа
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(ingredient.getRestaurantId())) {
            throw new BusinessException("Access denied to this ingredient");
        }
        
        return IngredientDto.fromEntity(ingredient);
    }
    
    @Transactional
    public IngredientDto createIngredient(IngredientDto dto) {
        log.info("Creating ingredient: {}", dto.name());
        
        // Проверка прав: только ADMIN или пользователь с правом CREATE_INGREDIENTS
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.CREATE_INGREDIENTS)) {
            throw new BusinessException("You don't have permission to create ingredients");
        }
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }
        
        if (ingredientRepository.existsByNameIgnoreCase(restaurantId, dto.name())) {
            throw new BusinessException("Ingredient with name '" + dto.name() + "' already exists");
        }
        
        Ingredient ingredient = new Ingredient();
        ingredient.setName(dto.name());
        ingredient.setUnit(dto.unit());
        ingredient.setStockQty(dto.stockQty() != null ? dto.stockQty() : 0.0);
        ingredient.setMinQty(dto.minQty() != null ? dto.minQty() : 0.0);
        ingredient.setRestaurant(restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        
        Ingredient saved = ingredientRepository.save(ingredient);
        log.info("Created ingredient with id: {}", saved.getId());
        
        // Логирование активности в отдельной транзакции
        // Если логирование не удастся, это не должно откатить создание ингредиента
        try {
        activityLogService.logActivity(
            "CREATE",
            "INGREDIENT",
            saved.getId(),
            "system",
            String.format("Создан ингредиент: %s", saved.getName()),
            null,
            Map.of("name", saved.getName(), "unit", saved.getUnit().toString(),
                   "stockQty", saved.getStockQty(), "minQty", saved.getMinQty())
        );
        } catch (Exception e) {
            // Логируем ошибку, но не прерываем транзакцию
            log.error("Failed to log ingredient creation activity: {}", e.getMessage());
        }
        
        return IngredientDto.fromEntity(saved);
    }
    
    @Transactional
    public IngredientDto updateIngredient(Long id, IngredientDto dto) {
        log.info("Updating ingredient id: {}", id);
        
        // Проверка прав: только ADMIN может обновлять ингредиенты
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.UPDATE_INGREDIENTS)) {
            throw new BusinessException("You don't have permission to update ingredients");
        }
        
        Ingredient ingredient = ingredientRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Ingredient not found with id: " + id));
        
        // Проверка прав доступа к ресторану
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(ingredient.getRestaurantId())) {
            throw new BusinessException("Access denied to this ingredient");
        }
        
        if (!ingredient.getName().equalsIgnoreCase(dto.name()) &&
            ingredientRepository.existsByNameIgnoreCase(restaurantId, dto.name())) {
            throw new BusinessException("Ingredient with name '" + dto.name() + "' already exists");
        }
        
        Map<String, Object> oldValues = Map.of(
            "name", ingredient.getName(),
            "unit", ingredient.getUnit().toString(),
            "minQty", ingredient.getMinQty()
        );
        
        ingredient.setName(dto.name());
        ingredient.setUnit(dto.unit());
        ingredient.setMinQty(dto.minQty());
        // stockQty обновляется через движения склада
        
        Ingredient saved = ingredientRepository.save(ingredient);
        log.info("Updated ingredient id: {}", saved.getId());
        
        // Логирование активности в отдельной транзакции
        try {
        activityLogService.logActivity(
            "UPDATE",
            "INGREDIENT",
            saved.getId(),
            "system",
            String.format("Обновлен ингредиент: %s", saved.getName()),
            oldValues,
            Map.of("name", saved.getName(), "unit", saved.getUnit().toString(),
                   "minQty", saved.getMinQty())
        );
        } catch (Exception e) {
            log.error("Failed to log ingredient update activity: {}", e.getMessage());
        }
        
        return IngredientDto.fromEntity(saved);
    }
    
    @Transactional
    public void deleteIngredient(Long id) {
        log.info("Deleting ingredient id: {}", id);
        
        // Проверка прав: только ADMIN может удалять ингредиенты
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.DELETE_INGREDIENTS)) {
            throw new BusinessException("You don't have permission to delete ingredients");
        }
        
        Ingredient ingredient = ingredientRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Ingredient not found with id: " + id));
        
        // Проверка прав доступа к ресторану
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(ingredient.getRestaurantId())) {
            throw new BusinessException("Access denied to this ingredient");
        }
        
        String ingredientName = ingredient.getName();
        ingredientRepository.deleteById(id);
        log.info("Deleted ingredient id: {}", id);
        
        // Логирование активности в отдельной транзакции
        try {
        activityLogService.logActivity(
            "DELETE",
            "INGREDIENT",
            id,
            "system",
            String.format("Удален ингредиент: %s", ingredientName),
            Map.of("name", ingredientName),
            null
        );
        } catch (Exception e) {
            log.error("Failed to log ingredient delete activity: {}", e.getMessage());
        }
    }
    
    public List<IngredientDto> getIngredientsBelowMinimum() {
        log.debug("Getting ingredients below minimum");
        Long restaurantId = getRestaurantId();
        return ingredientRepository.findIngredientsBelowMinimum(restaurantId).stream()
            .map(IngredientDto::fromEntity)
            .toList();
    }
    
    @Transactional
    public void updateStockQty(Long ingredientId, Double delta) {
        updateStockQtyWithRetry(ingredientId, delta, 3); // Максимум 3 попытки
    }
    
    @Transactional
    private void updateStockQtyWithRetry(Long ingredientId, Double delta, int maxRetries) {
        int attempts = 0;
        while (attempts < maxRetries) {
            try {
                Ingredient ingredient = ingredientRepository.findById(ingredientId)
                    .orElseThrow(() -> new ResourceNotFoundException("Ingredient not found with id: " + ingredientId));
                
                double newQty = ingredient.getStockQty() + delta;
                if (newQty < 0) {
                    throw new BusinessException("Stock quantity cannot be negative");
                }
                
                ingredient.setStockQty(newQty);
                ingredientRepository.save(ingredient);
                return; // Успешно обновлено
                
            } catch (org.springframework.orm.ObjectOptimisticLockingFailureException e) {
                attempts++;
                log.warn("Optimistic lock conflict for ingredient {} (attempt {}/{}), retrying...", 
                    ingredientId, attempts, maxRetries);
                
                if (attempts >= maxRetries) {
                    log.error("Failed to update stock after {} attempts for ingredient {}", maxRetries, ingredientId);
                    throw new BusinessException(
                        "Failed to update stock due to concurrent modification. Please try again.");
                }
                
                // Небольшая задержка перед повтором
                try {
                    Thread.sleep(50 * attempts); // Увеличиваем задержку с каждой попыткой
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new BusinessException("Update interrupted");
                }
            }
        }
    }
}

