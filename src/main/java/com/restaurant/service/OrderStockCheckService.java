package com.restaurant.service;

import com.restaurant.dto.DishIngredientDto;
import com.restaurant.exception.BusinessException;
import com.restaurant.model.Dish;
import com.restaurant.model.OptionGroupTemplate;
import com.restaurant.model.OptionItemTemplate;
import com.restaurant.model.Order;
import com.restaurant.model.OrderItem;
import com.restaurant.model.OrderItemOption;
import com.restaurant.repository.OptionGroupTemplateRepository;
import com.restaurant.repository.OptionItemTemplateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Расчёт расхода ингредиентов по позициям с модификаторами и проверка склада до закрытия заказа.
 */
@Service
@RequiredArgsConstructor
public class OrderStockCheckService {

    private final DishService dishService;
    private final StockService stockService;
    private final OptionGroupTemplateRepository optionGroupTemplateRepository;
    private final OptionItemTemplateRepository optionItemTemplateRepository;

    private static boolean templateScalesStock(OptionGroupTemplate.OptionGroupType type) {
        return type == OptionGroupTemplate.OptionGroupType.RANGE_STEPPER
                || type == OptionGroupTemplate.OptionGroupType.SINGLE_REQUIRED
                || type == OptionGroupTemplate.OptionGroupType.SINGLE_OPTIONAL;
    }

    private static int computeScaledPortions(List<OrderItemOption> tOpts, Map<Long, OptionItemTemplate> itemsById) {
        for (OrderItemOption o : tOpts) {
            if (o.getValueIntSnapshot() != null) {
                return Math.max(0, o.getValueIntSnapshot());
            }
        }
        int sum = 0;
        for (OrderItemOption o : tOpts) {
            if (o.getOptionItemTemplateId() == null) continue;
            OptionItemTemplate it = itemsById.get(o.getOptionItemTemplateId());
            int unit = (it != null && it.getValueInt() != null) ? it.getValueInt() : 1;
            int oq = o.getOptionQty() != null ? o.getOptionQty() : 1;
            sum += unit * oq;
        }
        return sum;
    }

    /**
     * Модификаторы: группа со складским ингредиентом пересчитывает норму (степпер / карточки с valueInt);
     * у позиции опции — доп. списание (stockQtyPerUnit × optionQty).
     */
    public void applyOptionStockAdjustments(
            OrderItem item,
            List<DishIngredientDto> recipe,
            Map<Long, Double> lineUsage) {
        List<OrderItemOption> opts = item.getOptions();
        if (opts == null || opts.isEmpty()) return;

        Set<Long> templateIds = opts.stream()
                .map(OrderItemOption::getTemplateId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, OptionGroupTemplate> templates = templateIds.isEmpty() ? Map.of()
                : optionGroupTemplateRepository.findAllById(templateIds).stream()
                .collect(Collectors.toMap(OptionGroupTemplate::getId, t -> t));

        Set<Long> oiIds = opts.stream()
                .map(OrderItemOption::getOptionItemTemplateId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, OptionItemTemplate> itemsById = oiIds.isEmpty() ? Map.of()
                : optionItemTemplateRepository.findAllById(oiIds).stream()
                .collect(Collectors.toMap(OptionItemTemplate::getId, i -> i));

        Map<Long, List<OrderItemOption>> byTemplate = opts.stream()
                .filter(o -> o.getTemplateId() != null)
                .collect(Collectors.groupingBy(OrderItemOption::getTemplateId));

        Map<Long, Double> recipePerDish = recipe.stream()
                .collect(Collectors.toMap(
                        DishIngredientDto::ingredientId,
                        DishIngredientDto::qtyPerDish,
                        Double::sum));

        for (Map.Entry<Long, List<OrderItemOption>> e : byTemplate.entrySet()) {
            OptionGroupTemplate t = templates.get(e.getKey());
            if (t == null) continue;
            if (!templateScalesStock(t.getType())) continue;
            List<OrderItemOption> tOpts = e.getValue();
            if (tOpts == null || tOpts.isEmpty()) continue;
            int v = computeScaledPortions(tOpts, itemsById);
            if (v <= 0) continue;

            if (t.getScaleIngredients() != null && !t.getScaleIngredients().isEmpty()) {
                for (var si : t.getScaleIngredients()) {
                    if (si.getIngredientId() == null) continue;
                    Double anchorValue = si.getAnchorValue();
                    if (anchorValue == null || anchorValue <= 0) anchorValue = 1.0;

                    double qtyPerDish = recipePerDish.getOrDefault(si.getIngredientId(), 0.0);
                    if (qtyPerDish <= 0) {
                        throw new BusinessException(String.format(
                                "В шаблоне опций указан ингредиент #%d для списания, но блюдо «%s» не содержит его в рецепте",
                                si.getIngredientId(), item.getDish().getName()));
                    }

                    double targetQty = si.getTargetQty() != null && si.getTargetQty() > 0 ? si.getTargetQty() : qtyPerDish;
                    double usage = targetQty * (v / anchorValue) * item.getQty();
                    lineUsage.merge(si.getIngredientId(), usage, Double::sum);
                }
                continue;
            }

            if (t.getStockIngredientId() != null) {
                int base = t.getStockScaleBase() != null && t.getStockScaleBase() > 0 ? t.getStockScaleBase() : 1;
                double ratio = v / (double) base;
                Long ingId = t.getStockIngredientId();
                double qtyPerDish = recipePerDish.getOrDefault(ingId, 0.0);
                if (qtyPerDish <= 0) {
                    throw new BusinessException(String.format(
                            "В шаблоне опций указан ингредиент #%d для списания, но блюдо «%s» не содержит его в рецепте",
                            ingId, item.getDish().getName()));
                }
                double usage = qtyPerDish * ratio * item.getQty();
                lineUsage.merge(ingId, usage, Double::sum);
            }
        }

        for (OrderItemOption o : opts) {
            if (o.getOptionItemTemplateId() == null) continue;
            OptionItemTemplate oit = itemsById.get(o.getOptionItemTemplateId());
            int oq = o.getOptionQty() != null ? o.getOptionQty() : 1;
            if (oit == null) continue;

            if (oit.getStockIngredientId() != null && oit.getStockQtyPerUnit() != null && oit.getStockQtyPerUnit() > 0) {
                lineUsage.merge(oit.getStockIngredientId(),
                        oit.getStockQtyPerUnit() * oq * item.getQty(),
                        Double::sum);
            }

            if (oit.getExtraIngredients() != null && !oit.getExtraIngredients().isEmpty()) {
                for (var ex : oit.getExtraIngredients()) {
                    if (ex.getIngredientId() == null || ex.getQtyPerUnit() == null || ex.getQtyPerUnit() <= 0) continue;
                    lineUsage.merge(ex.getIngredientId(),
                            ex.getQtyPerUnit() * oq * item.getQty(),
                            Double::sum);
                }
            }
        }
    }

    private void accumulateLineIngredientUsage(OrderItem item, Map<Long, Double> ingredientUsage) {
        List<DishIngredientDto> recipe = dishService.getRecipe(item.getDish().getId());
        if (recipe.isEmpty()) {
            throw new BusinessException(
                    String.format("У блюда «%s» нет рецепта — нельзя проверить склад", item.getDish().getName()));
        }
        Map<Long, Double> line = new HashMap<>();
        for (var recipeItem : recipe) {
            line.merge(recipeItem.ingredientId(), recipeItem.qtyPerDish() * item.getQty(), Double::sum);
        }
        applyOptionStockAdjustments(item, recipe, line);
        for (var e : line.entrySet()) {
            ingredientUsage.merge(e.getKey(), e.getValue(), Double::sum);
        }
    }

    public void validateStockAfterAdd(Order order, Dish dish, int requestQty,
            List<OrderItemOption> newOpts, OrderItem mergeTarget) {
        Map<Long, Double> ingredientUsage = new HashMap<>();
        for (OrderItem item : order.getItems()) {
            int lineQty = item.getQty();
            if (mergeTarget != null && item.getId() != null && item.getId().equals(mergeTarget.getId())) {
                lineQty = item.getQty() + requestQty;
            }
            OrderItem sim = new OrderItem();
            sim.setDish(item.getDish());
            sim.setQty(lineQty);
            sim.setOptions(item.getOptions());
            accumulateLineIngredientUsage(sim, ingredientUsage);
        }
        if (mergeTarget == null) {
            OrderItem sim = new OrderItem();
            sim.setDish(dish);
            sim.setQty(requestQty);
            sim.setOptions(newOpts != null ? newOpts : List.of());
            accumulateLineIngredientUsage(sim, ingredientUsage);
        }
        stockService.assertStockAvailable(ingredientUsage);
    }

    public void validateStockAfterItemQtyChange(Order order, OrderItem changedItem, int newQty) {
        Map<Long, Double> ingredientUsage = new HashMap<>();
        for (OrderItem item : order.getItems()) {
            int lineQty = item.getQty();
            if (item.getId() != null && changedItem.getId() != null && item.getId().equals(changedItem.getId())) {
                lineQty = newQty;
            }
            OrderItem sim = new OrderItem();
            sim.setDish(item.getDish());
            sim.setQty(lineQty);
            sim.setOptions(item.getOptions());
            accumulateLineIngredientUsage(sim, ingredientUsage);
        }
        stockService.assertStockAvailable(ingredientUsage);
    }
}
