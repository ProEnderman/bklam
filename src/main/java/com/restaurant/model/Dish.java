package com.restaurant.model;

import com.restaurant.util.UnicodeSubstringSearch;
import jakarta.persistence.*;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "dishes")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Dish {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotBlank(message = "Name is required")
    @Column(nullable = false)
    private String name;

    /** NFC + lowercase (ROOT) — substring search independent of PostgreSQL locale */
    @Column(name = "name_search_key", columnDefinition = "text")
    private String nameSearchKey;

    @DecimalMin(value = "0", message = "Price must be >= 0")
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;
    
    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id")
    private Restaurant restaurant;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private DishCategory category;
    
    @Column(name = "image_url")
    private String imageUrl;
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        refreshNameSearchKey();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
        refreshNameSearchKey();
    }

    private void refreshNameSearchKey() {
        if (name != null) {
            nameSearchKey = UnicodeSubstringSearch.normalizeSearchKey(name);
        }
    }
    
    public Long getRestaurantId() {
        return restaurant != null ? restaurant.getId() : null;
    }
    
    public Long getCategoryId() {
        return category != null ? category.getId() : null;
    }
}

