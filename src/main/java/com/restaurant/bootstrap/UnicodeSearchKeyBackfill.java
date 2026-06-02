package com.restaurant.bootstrap;

import com.restaurant.model.Dish;
import com.restaurant.model.Ingredient;
import com.restaurant.repository.DishRepository;
import com.restaurant.repository.IngredientRepository;
import com.restaurant.util.UnicodeSubstringSearch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Component
@Order(Integer.MIN_VALUE)
@RequiredArgsConstructor
@Slf4j
public class UnicodeSearchKeyBackfill implements ApplicationRunner {

    private final IngredientRepository ingredientRepository;
    private final DishRepository dishRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        backfillIngredients();
        backfillDishes();
    }

    private void backfillIngredients() {
        List<Ingredient> changed = new ArrayList<>();
        for (Ingredient ing : ingredientRepository.findAll()) {
            if (ing.getName() == null) continue;
            String nk = UnicodeSubstringSearch.normalizeSearchKey(ing.getName());
            if (!Objects.equals(nk, ing.getNameSearchKey())) {
                ing.setNameSearchKey(nk);
                changed.add(ing);
            }
        }
        if (!changed.isEmpty()) {
            log.info("Backfill: updating name_search_key for {} ingredient(s)", changed.size());
            ingredientRepository.saveAll(changed);
        }
    }

    private void backfillDishes() {
        List<Dish> changed = new ArrayList<>();
        for (Dish d : dishRepository.findAll()) {
            if (d.getName() == null) continue;
            String nk = UnicodeSubstringSearch.normalizeSearchKey(d.getName());
            if (!Objects.equals(nk, d.getNameSearchKey())) {
                d.setNameSearchKey(nk);
                changed.add(d);
            }
        }
        if (!changed.isEmpty()) {
            log.info("Backfill: updating name_search_key for {} dish(es)", changed.size());
            dishRepository.saveAll(changed);
        }
    }
}
