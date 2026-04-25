package com.restaurant.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "dish_ingredients", 
       uniqueConstraints = @UniqueConstraint(columnNames = {"dish_id", "ingredient_id"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DishIngredient {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dish_id", nullable = false)
    private Dish dish;
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ingredient_id", nullable = false)
    private Ingredient ingredient;
    
    @Positive(message = "Quantity per dish must be > 0")
    @Column(name = "qty_per_dish", nullable = false)
    private Double qtyPerDish;
}

