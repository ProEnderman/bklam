package com.restaurant.service;

import com.restaurant.dto.StockInRequest;
import com.restaurant.dto.StockMovementDto;
import com.restaurant.dto.StockOutRequest;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.InsufficientStockException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Ingredient;
import com.restaurant.model.StockMovement;
import com.restaurant.model.StockMovementReason;
import com.restaurant.model.StockMovementType;
import com.restaurant.repository.IngredientRepository;
import com.restaurant.repository.StockMovementRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class StockService {
    
    private final StockMovementRepository stockMovementRepository;
    private final IngredientRepository ingredientRepository;
    private final IngredientService ingredientService;
    private final ActivityLogService activityLogService;
    
    @Transactional
    public StockMovementDto stockIn(StockInRequest request) {
        log.info("Stock IN: ingredientId={}, qty={}", request.ingredientId(), request.qty());
        
        // Только ADMIN может делать приход
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.STOCK_IN)) {
            throw new BusinessException("You don't have permission to perform stock in");
        }
        
        Ingredient ingredient = ingredientRepository.findById(request.ingredientId())
            .orElseThrow(() -> new ResourceNotFoundException(
                "Ingredient not found with id: " + request.ingredientId()));
        
        // Проверка прав доступа к ресторану
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(ingredient.getRestaurantId())) {
            throw new BusinessException("Access denied to this ingredient");
        }
        
        StockMovement movement = new StockMovement();
        movement.setIngredient(ingredient);
        movement.setType(StockMovementType.IN);
        movement.setQty(request.qty());
        movement.setReason(StockMovementReason.PURCHASE);
        movement.setNote(request.note());
        String currentUsername = SecurityUtils.getCurrentUser() != null ? 
            SecurityUtils.getCurrentUser().getUsername() : "system";
        movement.setCreatedBy(currentUsername);
        
        StockMovement saved = stockMovementRepository.save(movement);
        
        // Обновляем остаток
        double oldQty = ingredient.getStockQty();
        ingredientService.updateStockQty(ingredient.getId(), request.qty());
        double newQty = oldQty + request.qty();
        
        log.info("Stock IN completed: movementId={}", saved.getId());
        
        // Логирование активности в отдельной транзакции
        // Если логирование не удастся, это не должно откатить операцию
        try {
        activityLogService.logActivity(
            "STOCK_IN",
            "STOCK_MOVEMENT",
            saved.getId(),
            currentUsername,
            String.format("Поступление товара: %s, количество: %.3f", ingredient.getName(), request.qty()),
            Map.of("ingredientId", ingredient.getId(), "ingredientName", ingredient.getName(),
                   "oldStockQty", oldQty),
            Map.of("ingredientId", ingredient.getId(), "ingredientName", ingredient.getName(),
                   "qty", request.qty(), "newStockQty", newQty, "note", request.note() != null ? request.note() : "")
        );
        } catch (Exception e) {
            // Логируем ошибку, но не прерываем транзакцию
            log.error("Failed to log stock in activity: {}", e.getMessage());
        }
        
        return StockMovementDto.fromEntity(saved);
    }
    
    @Transactional
    public StockMovementDto stockOut(StockOutRequest request) {
        log.info("Stock OUT: ingredientId={}, qty={}, reason={}", 
            request.ingredientId(), request.qty(), request.reason());
        
        // Только ADMIN может делать списание вручную
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.STOCK_OUT)) {
            throw new BusinessException("You don't have permission to perform stock out");
        }
        
        Ingredient ingredient = ingredientRepository.findById(request.ingredientId())
            .orElseThrow(() -> new ResourceNotFoundException(
                "Ingredient not found with id: " + request.ingredientId()));
        
        // Проверка прав доступа к ресторану
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(ingredient.getRestaurantId())) {
            throw new BusinessException("Access denied to this ingredient");
        }
        
        // Проверяем остаток
        if (ingredient.getStockQty() < request.qty()) {
            throw new InsufficientStockException(
                String.format("Insufficient stock. Available: %.2f, Required: %.2f",
                    ingredient.getStockQty(), request.qty()));
        }
        
        StockMovement movement = new StockMovement();
        movement.setIngredient(ingredient);
        movement.setType(StockMovementType.OUT);
        movement.setQty(request.qty());
        movement.setReason(request.reason());
        movement.setNote(request.note());
        String currentUsername = SecurityUtils.getCurrentUser() != null ? 
            SecurityUtils.getCurrentUser().getUsername() : "system";
        movement.setCreatedBy(currentUsername);
        
        StockMovement saved = stockMovementRepository.save(movement);
        
        // Обновляем остаток
        double oldQty = ingredient.getStockQty();
        ingredientService.updateStockQty(ingredient.getId(), -request.qty());
        double newQty = oldQty - request.qty();
        
        log.info("Stock OUT completed: movementId={}", saved.getId());
        
        // Логирование активности в отдельной транзакции
        // Если логирование не удастся, это не должно откатить операцию
        try {
        activityLogService.logActivity(
            "STOCK_OUT",
            "STOCK_MOVEMENT",
            saved.getId(),
            currentUsername,
            String.format("Списание товара: %s, количество: %.3f, причина: %s", 
                ingredient.getName(), request.qty(), request.reason().toString()),
            Map.of("ingredientId", ingredient.getId(), "ingredientName", ingredient.getName(),
                   "oldStockQty", oldQty),
            Map.of("ingredientId", ingredient.getId(), "ingredientName", ingredient.getName(),
                   "qty", request.qty(), "reason", request.reason().toString(),
                   "newStockQty", newQty, "note", request.note() != null ? request.note() : "")
        );
        } catch (Exception e) {
            // Логируем ошибку, но не прерываем транзакцию
            log.error("Failed to log stock out activity: {}", e.getMessage());
        }
        
        return StockMovementDto.fromEntity(saved);
    }
    
    @Transactional
    public void processOrderStockOut(Long orderId, Map<Long, Double> ingredientUsage) {
        log.info("Processing stock OUT for order: {}, ingredients: {}", orderId, ingredientUsage.size());
        
        assertStockAvailable(ingredientUsage);
        
        // Теперь списываем ингредиенты
        // Optimistic Locking в updateStockQty защитит от race condition
        for (Map.Entry<Long, Double> entry : ingredientUsage.entrySet()) {
            Long ingredientId = entry.getKey();
            Double qty = entry.getValue();
            
            Ingredient ingredient = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new ResourceNotFoundException(
                    "Ingredient not found with id: " + ingredientId));
            
            StockMovement movement = new StockMovement();
            movement.setIngredient(ingredient);
            movement.setType(StockMovementType.OUT);
            movement.setQty(qty);
            movement.setReason(StockMovementReason.SALE);
            movement.setOrderId(orderId);
            String currentUsername = SecurityUtils.getCurrentUser() != null ? 
                SecurityUtils.getCurrentUser().getUsername() : "system";
            movement.setCreatedBy(currentUsername);
            
            stockMovementRepository.save(movement);
            
            // Обновление остатка с защитой от race condition через Optimistic Locking
            ingredientService.updateStockQty(ingredientId, -qty);
        }
        
        log.info("Stock OUT for order {} completed", orderId);
    }

    /**
     * Проверка, что на складе достаточно ингредиентов (без списания).
     * Используется при добавлении позиций в открытый заказ, чтобы не допускать конфигураций,
     * которые невозможно будет списать при закрытии.
     */
    @Transactional(readOnly = true)
    public void assertStockAvailable(Map<Long, Double> ingredientUsage) {
        for (Map.Entry<Long, Double> entry : ingredientUsage.entrySet()) {
            Long ingredientId = entry.getKey();
            Double qty = entry.getValue();
            if (qty == null || qty <= 0) {
                continue;
            }
            Ingredient ingredient = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new ResourceNotFoundException(
                    "Ingredient not found with id: " + ingredientId));
            if (ingredient.getStockQty() + 1e-9 < qty) {
                throw new InsufficientStockException(
                    String.format("Недостаточно «%s» на складе. Доступно: %.2f, требуется: %.2f",
                        ingredient.getName(), ingredient.getStockQty(), qty));
            }
        }
    }
    
    @Transactional(readOnly = true)
    public Page<StockMovementDto> getMovements(
        Long ingredientId,
        StockMovementType type,
        StockMovementReason reason,
        LocalDateTime fromDate,
        LocalDateTime toDate,
        Pageable pageable
    ) {
        log.debug("Getting stock movements: ingredientId={}, type={}, reason={}, from={}, to={}",
            ingredientId, type, reason, fromDate, toDate);
        
        // REGULAR_WORKER должен иметь право VIEW_STOCK_MOVEMENTS
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.VIEW_STOCK_MOVEMENTS)) {
            throw new BusinessException("You don't have permission to view stock movements");
        }
        
        Long restaurantId = SecurityUtils.isHeadAdmin() ? null : SecurityUtils.getCurrentRestaurantId();
        
        // Convert null dates to very early/late dates to avoid PostgreSQL type inference issues
        LocalDateTime fromDateParam = fromDate != null ? fromDate : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDateParam = toDate != null ? toDate : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        
        // Convert enum to string for query
        String typeStr = type != null ? type.name() : null;
        String reasonStr = reason != null ? reason.name() : null;
        
        // Get total count
        long total = stockMovementRepository.countMovements(
            restaurantId, ingredientId, typeStr, reasonStr, fromDateParam, toDateParam
        );
        
        // Get movements with ingredient loaded (JOIN FETCH)
        List<StockMovement> movements = stockMovementRepository.findMovementsWithIngredient(
            restaurantId, ingredientId, typeStr, reasonStr, fromDateParam, toDateParam
        );
        
        int pageSize = pageable.getPageSize();
        int pageNumber = pageable.getPageNumber();
        long offset = pageable.getOffset();
        
        log.info("Before pagination: total={}, movements.size()={}, page={}, size={}, offset={}",
            total, movements.size(), pageNumber, pageSize, offset);
        
        // Apply pagination manually
        int start = (int) offset;
        int end = Math.min(start + pageSize, movements.size());
        
        log.info("Pagination calculation: start={}, end={}, pageSize={}, movements.size()={}",
            start, end, pageSize, movements.size());
        
        List<StockMovement> pagedMovements;
        if (start >= movements.size()) {
            pagedMovements = new java.util.ArrayList<>();
        } else {
            pagedMovements = movements.subList(start, end);
        }
        
        log.info("After pagination: pagedMovements.size()={}, expected={}", 
            pagedMovements.size(), Math.min(pageSize, movements.size() - start));
        
        // Convert to DTO
        List<StockMovementDto> dtos = pagedMovements.stream()
            .map(StockMovementDto::fromEntity)
            .collect(Collectors.toList());
        
        Page<StockMovementDto> result = new PageImpl<>(dtos, pageable, total);
        log.debug("Result Page: totalElements={}, totalPages={}, number={}, size={}, content.size()={}",
            result.getTotalElements(), result.getTotalPages(), result.getNumber(), result.getSize(), result.getContent().size());
        
        return result;
    }
}

