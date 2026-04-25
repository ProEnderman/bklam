package com.restaurant.service;

import com.restaurant.dto.CreateDishCategoryRequest;
import com.restaurant.dto.DishCategoryDto;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.DishCategory;
import com.restaurant.repository.DishCategoryRepository;
import com.restaurant.repository.DishRepository;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import org.springframework.core.io.Resource;
import org.springframework.core.io.PathResource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class DishCategoryService {
    
    private final DishCategoryRepository categoryRepository;
    private final RestaurantRepository restaurantRepository;
    private final DishRepository dishRepository;
    private final ActivityLogService activityLogService;
    
    @Value("${app.upload.dir:uploads}")
    private String uploadDir;
    
    private Long getRestaurantId() {
        if (SecurityUtils.isHeadAdmin()) {
            return null; // HEAD_ADMIN видит все
        }
        return SecurityUtils.getCurrentRestaurantId();
    }

    /** Если в БД лежит /api/categories/{id}/image — подменяем на /uploads/categories/filename для отдачи без 401. */
    private String resolveCategoryImageUrl(DishCategory category) {
        String imageUrl = category.getImageUrl();
        if (imageUrl == null || imageUrl.isEmpty()) return imageUrl;
        if (imageUrl.startsWith("/uploads/categories/")) return imageUrl;
        var m = Pattern.compile("^/api/categories/(\\d+)/image$").matcher(imageUrl);
        if (!m.matches()) return imageUrl;
        long catId = Long.parseLong(m.group(1));
        Path dir = Paths.get(uploadDir, "categories");
        if (!Files.isDirectory(dir)) return imageUrl;
        String prefix = "category_" + catId + "_";
        try {
            try (var stream = Files.list(dir)) {
                var found = stream
                    .filter(Files::isRegularFile)
                    .map(Path::getFileName)
                    .map(Path::toString)
                    .filter(name -> name.startsWith(prefix))
                    .findFirst();
                if (found.isPresent()) return "/uploads/categories/" + found.get();
            }
        } catch (IOException e) {
            log.warn("Could not resolve category image url for {}: {}", category.getId(), e.getMessage());
        }
        return imageUrl;
    }
    
    @Transactional(readOnly = true)
    public List<DishCategoryDto> getAllCategories() {
        log.debug("Getting all dish categories");
        Long restaurantId = getRestaurantId();
        List<DishCategory> categories = categoryRepository.findByRestaurantId(restaurantId);
        
        // Инициализируем lazy-loaded связи
        for (DishCategory category : categories) {
            category.getRestaurantId(); // Инициализируем restaurant
        }
        
        return categories.stream()
            .map(c -> DishCategoryDto.fromEntityWithImageUrl(c, resolveCategoryImageUrl(c)))
            .toList();
    }
    
    @Transactional(readOnly = true)
    public DishCategoryDto getCategoryById(Long id) {
        log.debug("Getting category by id: {}", id);
        DishCategory category = categoryRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + id));
        
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(category.getRestaurantId())) {
            throw new BusinessException("Access denied to this category");
        }
        
        category.getRestaurantId();
        return DishCategoryDto.fromEntityWithImageUrl(category, resolveCategoryImageUrl(category));
    }

    /** Возвращает файл изображения категории по id (для GET /api/categories/{id}/image). */
    @Transactional(readOnly = true)
    public Resource getCategoryImage(Long id) {
        DishCategory category = categoryRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + id));
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(category.getRestaurantId())) {
            throw new BusinessException("Access denied to this category");
        }
        String imageUrl = resolveCategoryImageUrl(category);
        if (imageUrl == null || !imageUrl.startsWith("/uploads/categories/")) {
            throw new ResourceNotFoundException("Category has no image");
        }
        String filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
        Path filePath = Paths.get(uploadDir, "categories", filename);
        if (!Files.exists(filePath) || !Files.isReadable(filePath)) {
            throw new ResourceNotFoundException("Image file not found");
        }
        return new PathResource(filePath);
    }
    
    @Transactional
    public DishCategoryDto createCategory(CreateDishCategoryRequest request) {
        log.info("Creating dish category: {}", request.name());
        
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.CREATE_DISHES)) {
            throw new BusinessException("You don't have permission to create categories");
        }
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }
        
        if (categoryRepository.existsByNameAndRestaurantId(request.name(), restaurantId)) {
            throw new BusinessException("Category with name '" + request.name() + "' already exists");
        }
        
        DishCategory category = new DishCategory();
        category.setName(request.name());
        category.setRestaurant(restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        
        DishCategory saved = categoryRepository.save(category);
        log.info("Created category with id: {}", saved.getId());
        
        try {
            activityLogService.logActivity(
                "CREATE", "DISH_CATEGORY", saved.getId(), null,
                String.format("Создана категория блюд: %s", saved.getName()),
                null,
                Map.of("name", saved.getName())
            );
        } catch (Exception e) {
            log.error("Failed to log category create: {}", e.getMessage());
        }
        
        return DishCategoryDto.fromEntity(saved);
    }
    
    @Transactional
    public DishCategoryDto updateCategory(Long id, CreateDishCategoryRequest request) {
        log.info("Updating category id: {}", id);
        
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.UPDATE_DISHES)) {
            throw new BusinessException("You don't have permission to update categories");
        }
        
        DishCategory category = categoryRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + id));
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(category.getRestaurantId())) {
            throw new BusinessException("Access denied to this category");
        }
        
        // Проверяем уникальность имени (если изменилось)
        if (!category.getName().equals(request.name()) && 
            categoryRepository.existsByNameAndRestaurantId(request.name(), restaurantId)) {
            throw new BusinessException("Category with name '" + request.name() + "' already exists");
        }
        
        String oldName = category.getName();
        category.setName(request.name());
        DishCategory saved = categoryRepository.save(category);
        log.info("Updated category id: {}", id);
        
        try {
            activityLogService.logActivity(
                "UPDATE", "DISH_CATEGORY", saved.getId(), null,
                String.format("Обновлена категория блюд: %s", saved.getName()),
                Map.of("name", oldName),
                Map.of("name", saved.getName())
            );
        } catch (Exception e) {
            log.error("Failed to log category update: {}", e.getMessage());
        }
        
        return DishCategoryDto.fromEntity(saved);
    }
    
    @Transactional
    public String saveCategoryImage(Long id, MultipartFile file) {
        log.info("Saving category image: categoryId={}, fileName={}", id, file.getOriginalFilename());
        
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.UPDATE_DISHES)) {
            throw new BusinessException("You don't have permission to update categories");
        }
        
        DishCategory category = categoryRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + id));
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(category.getRestaurantId())) {
            throw new BusinessException("Access denied to this category");
        }
        
        try {
            // Создаем директорию, если её нет
            Path uploadPath = Paths.get(uploadDir, "categories");
            Files.createDirectories(uploadPath);
            
            // Генерируем уникальное имя файла
            String originalFilename = file.getOriginalFilename();
            String extension = originalFilename != null && originalFilename.contains(".") 
                ? originalFilename.substring(originalFilename.lastIndexOf(".")) 
                : ".png";
            String filename = "category_" + id + "_" + UUID.randomUUID().toString() + extension;
            
            // Сохраняем файл
            Path filePath = uploadPath.resolve(filename);
            Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);
            
            // Формируем URL для доступа к файлу
            String imageUrl = "/uploads/categories/" + filename;
            
            // Удаляем старое изображение, если оно есть
            if (category.getImageUrl() != null && category.getImageUrl().startsWith("/uploads/categories/")) {
                try {
                    String oldFilename = category.getImageUrl().substring(category.getImageUrl().lastIndexOf("/") + 1);
                    Path oldFilePath = uploadPath.resolve(oldFilename);
                    if (Files.exists(oldFilePath)) {
                        Files.delete(oldFilePath);
                    }
                } catch (Exception e) {
                    log.warn("Failed to delete old image: {}", e.getMessage());
                }
            }
            
            // Обновляем категорию
            category.setImageUrl(imageUrl);
            categoryRepository.save(category);
            
            log.info("Saved category image: categoryId={}, imageUrl={}", id, imageUrl);
            return imageUrl;
        } catch (IOException e) {
            log.error("Failed to save category image: {}", e.getMessage(), e);
            throw new BusinessException("Не удалось сохранить изображение категории. Проверьте права на запись в директорию загрузок.");
        }
    }
    
    @Transactional
    public void deleteCategory(Long id) {
        log.info("Deleting category id: {}", id);
        
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.DELETE_DISHES)) {
            throw new BusinessException("You don't have permission to delete categories");
        }
        
        DishCategory category = categoryRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Category not found with id: " + id));
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(category.getRestaurantId())) {
            throw new BusinessException("Access denied to this category");
        }
        
        // Проверяем, есть ли блюда в этой категории
        long dishesCount = dishRepository.countByCategoryId(id);
        if (dishesCount > 0) {
            throw new BusinessException("Cannot delete category with " + dishesCount + " dishes. Please move or delete dishes first.");
        }
        
        try {
            activityLogService.logActivity(
                "DELETE", "DISH_CATEGORY", id, null,
                String.format("Удалена категория блюд: %s", category.getName()),
                Map.of("name", category.getName()), null
            );
        } catch (Exception e) {
            log.error("Failed to log category delete: {}", e.getMessage());
        }
        
        categoryRepository.delete(category);
        log.info("Deleted category id: {}", id);
    }
}

