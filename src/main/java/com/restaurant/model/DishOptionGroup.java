package com.restaurant.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Entity
@Table(name = "dish_option_groups")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DishOptionGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "dish_id", nullable = false)
    private Long dishId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "template_id", nullable = false)
    private OptionGroupTemplate template;

    @Column(name = "override_min_select") private Integer overrideMinSelect;
    @Column(name = "override_max_select") private Integer overrideMaxSelect;
    @Column(name = "override_min_total_qty") private Integer overrideMinTotalQty;
    @Column(name = "override_max_total_qty") private Integer overrideMaxTotalQty;
    @Column(name = "override_range_min") private Integer overrideRangeMin;
    @Column(name = "override_range_max") private Integer overrideRangeMax;
    @Column(name = "override_price_per_unit", precision = 12, scale = 2) private BigDecimal overridePricePerUnit;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    /** Resolved value: override if set, else template default. */
    public Integer effectiveMinSelect() {
        return overrideMinSelect != null ? overrideMinSelect : template.getMinSelect();
    }
    public Integer effectiveMaxSelect() {
        return overrideMaxSelect != null ? overrideMaxSelect : template.getMaxSelect();
    }
    public Integer effectiveMinTotalQty() {
        return overrideMinTotalQty != null ? overrideMinTotalQty : template.getMinTotalQty();
    }
    public Integer effectiveMaxTotalQty() {
        return overrideMaxTotalQty != null ? overrideMaxTotalQty : template.getMaxTotalQty();
    }
    public Integer effectiveRangeMin() {
        return overrideRangeMin != null ? overrideRangeMin : template.getRangeMin();
    }
    public Integer effectiveRangeMax() {
        return overrideRangeMax != null ? overrideRangeMax : template.getRangeMax();
    }
    public BigDecimal effectivePricePerUnit() {
        return overridePricePerUnit != null ? overridePricePerUnit : template.getPricePerUnit();
    }
}
