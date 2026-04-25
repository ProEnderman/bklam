package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "hall_assets",
    uniqueConstraints = @UniqueConstraint(name = "uq_hall_assets_restaurant_name", columnNames = {"restaurant_id", "name"})
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class HallAsset {

    public enum AssetType { TABLE, DECOR }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id", nullable = false)
    private Restaurant restaurant;

    @NotBlank
    @Column(nullable = false)
    private String name;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AssetType type;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "width_cells", nullable = false)
    private Integer widthCells = 1;

    @Column(name = "height_cells", nullable = false)
    private Integer heightCells = 1;

    @Column(name = "default_capacity")
    private Integer defaultCapacity;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getRestaurantId() {
        return restaurant != null ? restaurant.getId() : null;
    }
}



