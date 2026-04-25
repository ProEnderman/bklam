package com.restaurant.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Ингредиент рецепта, чей расход масштабируется по выбранному числу гостя (valueInt / stockScaleBase).
 * У одной группы опций может быть несколько таких ингредиентов.
 */
@Entity
@Table(name = "option_group_template_scale_ingredients",
       uniqueConstraints = @UniqueConstraint(columnNames = { "option_group_template_id", "ingredient_id" }))
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OptionGroupTemplateScaleIngredient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "option_group_template_id", nullable = false)
    private OptionGroupTemplate optionGroupTemplate;

    @Column(name = "ingredient_id", nullable = false)
    private Long ingredientId;

    /**
     * "Сколько единиц": при выборе гостем значения v = anchorValue расход считается как targetQty.
     * То есть usage = targetQty * (v / anchorValue).
     */
    @Column(name = "anchor_value", nullable = false)
    private Double anchorValue = 1.0;

    /**
     * "Количество изменения ингредиента": сколько этого ингредиента нужно получить (списать),
     * когда выбор гостя равен anchorValue.
     */
    @Column(name = "target_qty", nullable = false)
    private Double targetQty = 0.0;
}
