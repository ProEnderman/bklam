package com.restaurant.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "option_item_templates")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OptionItemTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "template_id", nullable = false)
    private OptionGroupTemplate template;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(name = "price_delta", nullable = false, precision = 12, scale = 2)
    private BigDecimal priceDelta = BigDecimal.ZERO;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "per_option_max_qty")
    private Integer perOptionMaxQty;

    @Column(name = "value_int")
    private Integer valueInt;

    @Column(name = "is_default", nullable = false)
    private Boolean isDefault = false;

    /** Доп. списание на 1 optionQty при закрытии заказа (если заданы оба поля). */
    @Column(name = "stock_ingredient_id")
    private Long stockIngredientId;

    @Column(name = "stock_qty_per_unit")
    private Double stockQtyPerUnit;

    /** Несколько ингредиентов с доп. расходом на 1 optionQty (плюс один через stockIngredientId выше). */
    @OneToMany(mappedBy = "optionItemTemplate", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<OptionItemTemplateIngredient> extraIngredients = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }

    @PreUpdate
    void onUpdate() { updatedAt = LocalDateTime.now(); }
}
