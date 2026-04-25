package com.restaurant.service;

import com.restaurant.dto.DishDto;
import com.restaurant.dto.DishIngredientDto;
import com.restaurant.dto.UpdateRecipeRequest;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Dish;
import com.restaurant.model.DishIngredient;
import com.restaurant.model.Ingredient;
import com.restaurant.repository.DishCategoryRepository;
import com.restaurant.repository.DishIngredientRepository;
import com.restaurant.repository.DishRepository;
import com.restaurant.repository.IngredientRepository;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DishService {
    
    private final DishRepository dishRepository;
    private final DishCategoryRepository dishCategoryRepository;
    private final DishIngredientRepository dishIngredientRepository;
    private final IngredientRepository ingredientRepository;
    private final RestaurantRepository restaurantRepository;
    private final ActivityLogService activityLogService;
    
    @Value("${app.upload.dir:uploads}")
    private String uploadDir;
    
    private Long getRestaurantId() {
        if (SecurityUtils.isHeadAdmin()) {
            return null;
        }
        return SecurityUtils.getCurrentRestaurantId();
    }
    
    @Transactional(readOnly = true)
    public Page<DishDto> getAllDishes(String search, Boolean isActive, Pageable pageable) {
        log.debug("Getting dishes with search: {}, isActive: {}", search, isActive);
        
        // REGULAR_WORKER должен иметь право VIEW_DISHES
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.VIEW_DISHES)) {
            throw new BusinessException("You don't have permission to view dishes");
        }
        
        Long restaurantId = getRestaurantId();
        Page<Dish> dishes = dishRepository.searchDishes(restaurantId, search, isActive, pageable);
        
        // Инициализируем lazy-loaded связи (category)
        for (Dish dish : dishes.getContent()) {
            if (dish.getCategory() != null) {
                dish.getCategory().getName();
            }
        }
        
        return dishes.map(DishDto::fromEntity);
    }
    
    @Transactional(readOnly = true)
    public List<DishDto> getDishesByCategory(Long categoryId) {
        log.debug("Getting dishes by category: {}", categoryId);
        
        // REGULAR_WORKER должен иметь право VIEW_DISHES
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.VIEW_DISHES)) {
            throw new BusinessException("You don't have permission to view dishes");
        }
        
        Long restaurantId = getRestaurantId();
        List<Dish> dishes = dishRepository.findByRestaurantIdAndCategoryId(restaurantId, categoryId, true);
        
        // Инициализируем lazy-loaded связи (category)
        for (Dish dish : dishes) {
            if (dish.getCategory() != null) {
                dish.getCategory().getName();
            }
        }
        
        return dishes.stream()
            .map(DishDto::fromEntity)
            .toList();
    }
    
    @Transactional(readOnly = true)
    public DishDto getDishById(Long id) {
        log.debug("Getting dish by id: {}", id);
        // Используем JOIN FETCH для загрузки категории вместе с блюдом
        Dish dish = dishRepository.findByIdWithCategory(id)
            .orElseThrow(() -> new ResourceNotFoundException("Dish not found with id: " + id));
        
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(dish.getRestaurantId())) {
            throw new BusinessException("Access denied to this dish");
        }
        
        return DishDto.fromEntity(dish);
    }
    
    @Transactional
    public DishDto createDish(DishDto dto) {
        log.info("Creating dish: {}", dto.name());
        
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.CREATE_DISHES)) {
            throw new BusinessException("You don't have permission to create dishes");
        }
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }
        
        if (dishRepository.existsByNameIgnoreCase(restaurantId, dto.name())) {
            throw new BusinessException("Dish with name '" + dto.name() + "' already exists");
        }
        
        Dish dish = new Dish();
        dish.setName(dto.name());
        dish.setPrice(dto.price());
        dish.setIsActive(dto.isActive() != null ? dto.isActive() : true);
        dish.setRestaurant(restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        
        // Устанавливаем категорию, если указана
        if (dto.categoryId() != null) {
            dish.setCategory(dishCategoryRepository.findById(dto.categoryId())
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + dto.categoryId())));
        }
        
        Dish saved = dishRepository.save(dish);
        log.info("Created dish with id: {}", saved.getId());
        
        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "CREATE",
            "DISH",
            saved.getId(),
            username,
            String.format("Создано блюдо: %s", saved.getName()),
            null,
            Map.of("name", saved.getName(), "price", saved.getPrice(),
                   "isActive", saved.getIsActive())
        );
        } catch (Exception e) {
            log.error("Failed to log dish creation activity: {}", e.getMessage());
        }
        
        return DishDto.fromEntity(saved);
    }
    
    @Transactional
    public DishDto updateDish(Long id, DishDto dto) {
        log.info("Updating dish id: {}", id);
        
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.UPDATE_DISHES)) {
            throw new BusinessException("You don't have permission to update dishes");
        }
        
        Dish dish = dishRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Dish not found with id: " + id));
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(dish.getRestaurantId())) {
            throw new BusinessException("Access denied to this dish");
        }
        
        if (!dish.getName().equalsIgnoreCase(dto.name()) &&
            dishRepository.existsByNameIgnoreCase(restaurantId, dto.name())) {
            throw new BusinessException("Dish with name '" + dto.name() + "' already exists");
        }
        
        Map<String, Object> oldValues = Map.of(
            "name", dish.getName(),
            "price", dish.getPrice(),
            "isActive", dish.getIsActive()
        );
        
        dish.setName(dto.name());
        dish.setPrice(dto.price());
        dish.setIsActive(dto.isActive());
        
        // Обновляем категорию, если указана
        if (dto.categoryId() != null) {
            dish.setCategory(dishCategoryRepository.findById(dto.categoryId())
                .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + dto.categoryId())));
        } else {
            dish.setCategory(null);
        }
        
        Dish saved = dishRepository.save(dish);
        log.info("Updated dish id: {}", saved.getId());
        
        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "UPDATE",
            "DISH",
            saved.getId(),
            username,
            String.format("Обновлено блюдо: %s", saved.getName()),
            oldValues,
            Map.of("name", saved.getName(), "price", saved.getPrice(),
                   "isActive", saved.getIsActive())
        );
        } catch (Exception e) {
            log.error("Failed to log dish update activity: {}", e.getMessage());
        }
        
        return DishDto.fromEntity(saved);
    }
    
    @Transactional
    public void deleteDish(Long id) {
        log.info("Deleting dish id: {}", id);
        
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.DELETE_DISHES)) {
            throw new BusinessException("You don't have permission to delete dishes");
        }
        
        Dish dish = dishRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Dish not found with id: " + id));
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(dish.getRestaurantId())) {
            throw new BusinessException("Access denied to this dish");
        }
        String dishName = dish.getName();
        dish.setIsActive(false);
        dishRepository.save(dish);
        log.info("Soft deleted dish id: {}", id);
        
        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "DELETE",
            "DISH",
            id,
            username,
            String.format("Удалено блюдо: %s", dishName),
            Map.of("name", dishName, "isActive", true),
            Map.of("name", dishName, "isActive", false)
        );
        } catch (Exception e) {
            log.error("Failed to log dish delete activity: {}", e.getMessage());
        }
    }
    
    @Transactional(readOnly = true)
    public List<DishIngredientDto> getRecipe(Long dishId) {
        log.debug("Getting recipe for dish id: {}", dishId);
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.VIEW_DISHES)) {
            throw new BusinessException("You don't have permission to view dish recipes");
        }
        Dish dish = dishRepository.findById(dishId)
            .orElseThrow(() -> new ResourceNotFoundException("Dish not found with id: " + dishId));
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(dish.getRestaurantId())) {
            throw new BusinessException("Access denied to this dish");
        }
        return dishIngredientRepository.findByDishIdWithIngredient(dishId).stream()
            .map(DishIngredientDto::fromEntity)
            .toList();
    }
    
    @Transactional
    public void updateRecipe(Long dishId, UpdateRecipeRequest request) {
        log.info("Updating recipe for dish id: {}", dishId);
        
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.MANAGE_RECIPES)) {
            throw new BusinessException("You don't have permission to manage recipes");
        }
        
        Dish dish = dishRepository.findById(dishId)
            .orElseThrow(() -> new ResourceNotFoundException("Dish not found with id: " + dishId));
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(dish.getRestaurantId())) {
            throw new BusinessException("Access denied to this dish");
        }
        
        // Проверяем, что все ингредиенты из того же ресторана
        for (var item : request.ingredients()) {
            Ingredient ingredient = ingredientRepository.findById(item.ingredientId())
                .orElseThrow(() -> new ResourceNotFoundException(
                    "Ingredient not found with id: " + item.ingredientId()));
            
            if (!restaurantId.equals(ingredient.getRestaurantId())) {
                throw new BusinessException("Cannot use ingredient from another restaurant");
            }
        }
        
        // Удаляем старую рецептуру
        dishIngredientRepository.deleteByDishId(dishId);
        
        // Создаем новую рецептуру
        for (var item : request.ingredients()) {
            Ingredient ingredient = ingredientRepository.findById(item.ingredientId())
                .orElseThrow(() -> new ResourceNotFoundException(
                    "Ingredient not found with id: " + item.ingredientId()));
            
            DishIngredient dishIngredient = new DishIngredient();
            dishIngredient.setDish(dish);
            dishIngredient.setIngredient(ingredient);
            dishIngredient.setQtyPerDish(item.qtyPerDish());
            
            dishIngredientRepository.save(dishIngredient);
        }
        
        log.info("Updated recipe for dish id: {}", dishId);
        
        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "UPDATE_RECIPE",
            "DISH",
            dishId,
            username,
            String.format("Обновлен рецепт блюда: %s (%d ингредиентов)", dish.getName(), request.ingredients().size()),
            null,
            Map.of("ingredientsCount", request.ingredients().size())
        );
        } catch (Exception e) {
            log.error("Failed to log recipe update activity: {}", e.getMessage());
        }
    }
    
    @Transactional
    public String saveDishImage(Long id, MultipartFile file) {
        log.info("Saving dish image: dishId={}, fileName={}", id, file.getOriginalFilename());
        
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.UPDATE_DISHES)) {
            throw new BusinessException("You don't have permission to update dishes");
        }
        
        Dish dish = dishRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Dish not found with id: " + id));
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(dish.getRestaurantId())) {
            throw new BusinessException("Access denied to this dish");
        }
        
        try {
            // Создаем директорию, если её нет
            Path uploadPath = Paths.get(uploadDir, "dishes");
            Files.createDirectories(uploadPath);
            
            // Генерируем уникальное имя файла
            String originalFilename = file.getOriginalFilename();
            String extension = originalFilename != null && originalFilename.contains(".") 
                ? originalFilename.substring(originalFilename.lastIndexOf(".")) 
                : ".png";
            String filename = "dish_" + id + "_" + UUID.randomUUID().toString() + extension;
            
            // Сохраняем файл
            Path filePath = uploadPath.resolve(filename);
            Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);
            
            // Формируем URL для доступа к файлу
            String imageUrl = "/uploads/dishes/" + filename;
            
            // Удаляем старое изображение, если оно есть
            if (dish.getImageUrl() != null && dish.getImageUrl().startsWith("/uploads/dishes/")) {
                try {
                    String oldFilename = dish.getImageUrl().substring(dish.getImageUrl().lastIndexOf("/") + 1);
                    Path oldFilePath = uploadPath.resolve(oldFilename);
                    if (Files.exists(oldFilePath)) {
                        Files.delete(oldFilePath);
                    }
                } catch (Exception e) {
                    log.warn("Failed to delete old image: {}", e.getMessage());
                }
            }
            
            // Обновляем блюдо
            dish.setImageUrl(imageUrl);
            dishRepository.save(dish);
            
            log.info("Saved dish image: dishId={}, imageUrl={}", id, imageUrl);
            return imageUrl;
        } catch (IOException e) {
            log.error("Failed to save dish image: {}", e.getMessage(), e);
            throw new BusinessException("Не удалось сохранить изображение блюда. Проверьте права на запись в директорию загрузок.");
        }
    }
}

