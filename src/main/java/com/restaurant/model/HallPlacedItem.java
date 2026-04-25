package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "hall_placed_items")
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class HallPlacedItem {

    public enum ItemType { TABLE, DECOR }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hall_map_id", nullable = false)
    private HallMap hallMap;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "asset_id")
    private HallAsset asset;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ItemType type;

    @NotNull
    @Column(nullable = false)
    private Integer x;

    @NotNull
    @Column(nullable = false)
    private Integer y;

    @NotNull
    @Column(nullable = false)
    private Integer w = 1;

    @NotNull
    @Column(nullable = false)
    private Integer h = 1;

    @NotNull
    @Column(nullable = false)
    private Integer rotation = 0;

    @NotNull
    @Column(nullable = false)
    private Integer layer = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "table_id")
    private HallTable table;

    @Column(nullable = false)
    private Boolean locked = false;

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

    public Long getHallMapId() {
        return hallMap != null ? hallMap.getId() : null;
    }

    public Long getAssetId() {
        return asset != null ? asset.getId() : null;
    }

    public Long getTableId() {
        return table != null ? table.getId() : null;
    }
}



