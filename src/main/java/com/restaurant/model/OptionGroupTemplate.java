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
@Table(name = "option_group_templates")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OptionGroupTemplate {

    public enum OptionGroupType {
        SINGLE_REQUIRED, SINGLE_OPTIONAL, MULTI, MULTI_REQUIRED,
        MULTI_QTY_TOTAL_LIMIT, RANGE_STEPPER, EXCLUSIONS, HALF_AND_HALF
    }

    public enum PricingMode { PER_UNIT, LOOKUP }

    public enum Presentation { CHIPS, RADIO, CHECKBOX, CARDS, STEPPER }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "key", nullable = false, unique = true, length = 64)
    private String key;

    @Column(nullable = false, length = 200)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private OptionGroupType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Presentation presentation = Presentation.CHECKBOX;

    @Column(name = "min_select") private Integer minSelect;
    @Column(name = "max_select") private Integer maxSelect;
    @Column(name = "min_total_qty") private Integer minTotalQty;
    @Column(name = "max_total_qty") private Integer maxTotalQty;
    @Column(name = "range_min") private Integer rangeMin;
    @Column(name = "range_max") private Integer rangeMax;

    @Enumerated(EnumType.STRING)
    @Column(name = "pricing_mode", length = 20)
    private PricingMode pricingMode;

    @Column(name = "price_per_unit", precision = 12, scale = 2)
    private BigDecimal pricePerUnit;

    @Column(name = "allow_same_option_twice")
    private Boolean allowSameOptionTwice;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    /** Если задан — при закрытии заказа норма этого ингредиента в рецепте умножается на (выбор / stockScaleBase). */
    @Column(name = "stock_ingredient_id")
    private Long stockIngredientId;

    @Column(name = "stock_scale_base", nullable = false)
    private Integer stockScaleBase = 1;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "template", fetch = FetchType.LAZY, cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<OptionItemTemplate> items = new ArrayList<>();

    /** Ингредиенты рецепта, чей расход умножается на (выбор гостя / stockScaleBase). Может быть несколько. */
    @OneToMany(mappedBy = "optionGroupTemplate", fetch = FetchType.LAZY, cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OptionGroupTemplateScaleIngredient> scaleIngredients = new ArrayList<>();

    @PrePersist
    void onCreate() {
        createdAt = updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
