package com.restaurant.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Доп. списание ингредиента на 1 единицу выбранной опции (optionQty).
 * У одной опции может быть несколько таких записей — несколько ингредиентов меняются сразу.
 */
@Entity
@Table(name = "option_item_template_ingredients",
       uniqueConstraints = @UniqueConstraint(columnNames = { "option_item_template_id", "ingredient_id" }))
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OptionItemTemplateIngredient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "option_item_template_id", nullable = false)
    private OptionItemTemplate optionItemTemplate;

    @Column(name = "ingredient_id", nullable = false)
    private Long ingredientId;

    @Column(name = "qty_per_unit", nullable = false)
    private Double qtyPerUnit;
}
