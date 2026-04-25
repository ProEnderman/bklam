package com.restaurant.controller;

import com.restaurant.model.DishOptionGroup;
import com.restaurant.model.OptionGroupTemplate;
import com.restaurant.model.OptionGroupTemplate.*;
import com.restaurant.model.OptionItemTemplate;
import com.restaurant.model.OptionGroupTemplateScaleIngredient;
import com.restaurant.model.OptionItemTemplateIngredient;
import com.restaurant.repository.DishOptionGroupRepository;
import com.restaurant.repository.OptionGroupTemplateRepository;
import com.restaurant.repository.OptionItemTemplateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.HashSet;
import java.util.Set;

@RestController
@RequestMapping("/api/option-templates")
@RequiredArgsConstructor
public class OptionGroupTemplateController {

    private final OptionGroupTemplateRepository templateRepo;
    private final OptionItemTemplateRepository itemRepo;
    private final DishOptionGroupRepository dishOptionGroupRepo;

    // ── Template CRUD ──

    @GetMapping
    @Transactional(readOnly = true)
    public List<TemplateDto> list() {
        List<OptionGroupTemplate> all = templateRepo.findAll(Sort.by("sortOrder", "id"));
        for (OptionGroupTemplate t : all) { t.getItems().size(); t.getScaleIngredients().size(); }
        return all.stream().map(TemplateDto::from).toList();
    }

    @PostMapping
    @Transactional
    public ResponseEntity<TemplateDto> create(@RequestBody CreateTemplateRequest req) {
        OptionGroupTemplate t = new OptionGroupTemplate();
        applyFields(t, req);
        if (req.items != null) {
            for (var ir : req.items) {
                OptionItemTemplate item = new OptionItemTemplate();
                item.setTitle(ir.title);
                item.setPriceDelta(ir.priceDelta != null ? ir.priceDelta : BigDecimal.ZERO);
                item.setSortOrder(ir.sortOrder != null ? ir.sortOrder : 0);
                item.setPerOptionMaxQty(ir.perOptionMaxQty);
                item.setValueInt(ir.valueInt);
                item.setIsDefault(Boolean.TRUE.equals(ir.isDefault));
                item.setStockIngredientId(ir.stockIngredientId);
                item.setStockQtyPerUnit(ir.stockQtyPerUnit);
                if (ir.extraIngredients != null && !ir.extraIngredients.isEmpty()) {
                    for (var ei : ir.extraIngredients) {
                        if (ei == null || ei.ingredientId == null || ei.qtyPerUnit == null || ei.qtyPerUnit <= 0) continue;
                        OptionItemTemplateIngredient ex = new OptionItemTemplateIngredient();
                        ex.setOptionItemTemplate(item);
                        ex.setIngredientId(ei.ingredientId);
                        ex.setQtyPerUnit(ei.qtyPerUnit);
                        item.getExtraIngredients().add(ex);
                    }
                }
                item.setTemplate(t);
                t.getItems().add(item);
            }
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(TemplateDto.from(templateRepo.save(t)));
    }

    @PutMapping("/{id}")
    @Transactional
    public TemplateDto update(@PathVariable Long id, @RequestBody CreateTemplateRequest req) {
        OptionGroupTemplate t = templateRepo.findById(id)
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Template not found"));
        applyFields(t, req);
        return TemplateDto.from(templateRepo.save(t));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        templateRepo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    // ── Template Item CRUD ──

    @PostMapping("/{templateId}/items")
    @Transactional
    public TemplateDto addItem(@PathVariable Long templateId, @RequestBody ItemRequest req) {
        OptionGroupTemplate t = templateRepo.findById(templateId)
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Template not found"));
        t.getItems().size();
        OptionItemTemplate item = new OptionItemTemplate();
        item.setTitle(req.title);
        item.setPriceDelta(req.priceDelta != null ? req.priceDelta : BigDecimal.ZERO);
        item.setSortOrder(req.sortOrder != null ? req.sortOrder : 0);
        item.setPerOptionMaxQty(req.perOptionMaxQty);
        item.setValueInt(req.valueInt);
        item.setIsDefault(Boolean.TRUE.equals(req.isDefault));
        item.setStockIngredientId(req.stockIngredientId);
        item.setStockQtyPerUnit(req.stockQtyPerUnit);
        if (req.extraIngredients != null && !req.extraIngredients.isEmpty()) {
            for (var ei : req.extraIngredients) {
                if (ei == null || ei.ingredientId == null || ei.qtyPerUnit == null || ei.qtyPerUnit <= 0) continue;
                OptionItemTemplateIngredient ex = new OptionItemTemplateIngredient();
                ex.setOptionItemTemplate(item);
                ex.setIngredientId(ei.ingredientId);
                ex.setQtyPerUnit(ei.qtyPerUnit);
                item.getExtraIngredients().add(ex);
            }
        }
        item.setTemplate(t);
        t.getItems().add(item);
        return TemplateDto.from(templateRepo.save(t));
    }

    @DeleteMapping("/{templateId}/items/{itemId}")
    @Transactional
    public TemplateDto removeItem(@PathVariable Long templateId, @PathVariable Long itemId) {
        OptionGroupTemplate t = templateRepo.findById(templateId)
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Template not found"));
        t.getItems().size();
        t.getItems().removeIf(i -> i.getId().equals(itemId));
        return TemplateDto.from(templateRepo.save(t));
    }

    // ── Dish ↔ Template linking ──

    @GetMapping("/dish/{dishId}")
    @Transactional(readOnly = true)
    public List<Long> getDishTemplates(@PathVariable Long dishId) {
        return dishOptionGroupRepo.findByDishIdAndIsActiveTrueOrderBySortOrderAsc(dishId)
                .stream().map(g -> g.getTemplate().getId()).toList();
    }

    @GetMapping("/dish/{dishId}/groups")
    @Transactional(readOnly = true)
    public List<DishOptionGroupDto> getDishOptionGroups(@PathVariable Long dishId) {
        List<DishOptionGroup> groups = dishOptionGroupRepo.findByDishIdAndIsActiveTrueOrderBySortOrderAsc(dishId);
        Map<Long, DishOptionGroup> byTemplate = new LinkedHashMap<>();
        for (DishOptionGroup g : groups) {
            Long tid = g.getTemplate().getId();
            if (!byTemplate.containsKey(tid)) {
                byTemplate.put(tid, g);
            }
        }
        return new ArrayList<>(byTemplate.values()).stream().map(g -> {
            OptionGroupTemplate t = g.getTemplate();
            t.getItems().size();
            if (t.getScaleIngredients() != null) t.getScaleIngredients().size();
            LinkedHashSet<Long> seenItemIds = new LinkedHashSet<>();
            List<DishOptionItemDto> items = t.getItems().stream()
                    .filter(i -> Boolean.TRUE.equals(i.getIsActive()))
                    .sorted((a, b) -> Integer.compare(
                            a.getSortOrder() != null ? a.getSortOrder() : 0,
                            b.getSortOrder() != null ? b.getSortOrder() : 0
                    ))
                    .filter(i -> seenItemIds.add(i.getId()))
                    .map(i -> new DishOptionItemDto(
                            i.getId(),
                            i.getTitle(),
                            i.getPriceDelta(),
                            i.getPerOptionMaxQty(),
                            i.getValueInt(),
                            i.getIsDefault(),
                            i.getStockIngredientId(),
                            i.getStockQtyPerUnit(),
                            i.getExtraIngredients() != null
                                    ? i.getExtraIngredients().stream()
                                    .map(e -> new ItemIngredientDto(e.getIngredientId(), e.getQtyPerUnit()))
                                    .toList()
                                    : List.of()
                    ))
                    .toList();
            return new DishOptionGroupDto(
                    g.getId(),
                    t.getId(),
                    t.getTitle(),
                    t.getType().name(),
                    t.getPresentation().name(),
                    new DishOptionRulesDto(
                            g.effectiveMinSelect(),
                            g.effectiveMaxSelect(),
                            g.effectiveMinTotalQty(),
                            g.effectiveMaxTotalQty(),
                            g.effectiveRangeMin(),
                            g.effectiveRangeMax(),
                            t.getPricingMode() != null ? t.getPricingMode().name() : null,
                            g.effectivePricePerUnit(),
                            t.getAllowSameOptionTwice()
                    ),
                    items,
                    t.getStockIngredientId(),
                    t.getStockScaleBase() != null ? t.getStockScaleBase() : 1,
                    t.getScaleIngredients() != null
                            ? t.getScaleIngredients().stream()
                            .map(si -> new ScaleIngredientDto(si.getIngredientId(), si.getAnchorValue(), si.getTargetQty()))
                            .toList()
                            : List.of()
            );
        }).toList();
    }

    @PutMapping("/dish/{dishId}")
    @Transactional
    public ResponseEntity<Map<String, Object>> setDishTemplates(
            @PathVariable Long dishId, @RequestBody List<Long> templateIds) {
        List<DishOptionGroup> existing = dishOptionGroupRepo.findByDishIdAndIsActiveTrueOrderBySortOrderAsc(dishId);
        dishOptionGroupRepo.deleteAll(existing);
        dishOptionGroupRepo.flush();

        int sortOrder = 0;
        for (Long tid : templateIds) {
            OptionGroupTemplate tmpl = templateRepo.findById(tid).orElse(null);
            if (tmpl == null) continue;
            DishOptionGroup link = new DishOptionGroup();
            link.setDishId(dishId);
            link.setTemplate(tmpl);
            link.setSortOrder(sortOrder++);
            link.setIsActive(true);
            dishOptionGroupRepo.save(link);
        }
        return ResponseEntity.ok(Map.of("dishId", dishId, "linkedTemplates", templateIds.size()));
    }

    // ── helpers ──

    private void applyFields(OptionGroupTemplate t, CreateTemplateRequest req) {
        t.setKey(req.key);
        t.setTitle(req.title);
        t.setType(req.type != null ? OptionGroupType.valueOf(req.type) : OptionGroupType.SINGLE_OPTIONAL);
        t.setPresentation(req.presentation != null ? Presentation.valueOf(req.presentation) : Presentation.CHECKBOX);
        t.setMinSelect(req.minSelect);
        t.setMaxSelect(req.maxSelect);
        t.setMinTotalQty(req.minTotalQty);
        t.setMaxTotalQty(req.maxTotalQty);
        t.setRangeMin(req.rangeMin);
        t.setRangeMax(req.rangeMax);
        t.setPricingMode(req.pricingMode != null ? PricingMode.valueOf(req.pricingMode) : null);
        t.setPricePerUnit(req.pricePerUnit);
        t.setAllowSameOptionTwice(req.allowSameOptionTwice);
        t.setSortOrder(req.sortOrder != null ? req.sortOrder : 0);
        t.setIsActive(req.isActive != null ? req.isActive : true);
        t.setStockIngredientId(req.stockIngredientId);
        t.setStockScaleBase(req.stockScaleBase != null && req.stockScaleBase > 0 ? req.stockScaleBase : 1);
        // Обновляем scaleIngredients без полного clear(), чтобы избежать конфликтов уникального
        // индекса (template_id, ingredient_id) в одном flush-цикле.
        Map<Long, ScaleIngredientRequest> incomingByIng = new LinkedHashMap<>();
        if (req.scaleIngredients != null) {
            for (ScaleIngredientRequest sir : req.scaleIngredients) {
                if (sir == null || sir.ingredientId == null) continue;
                // Последнее значение для одинакового ingredientId побеждает.
                incomingByIng.put(sir.ingredientId, sir);
            }
        }

        Map<Long, OptionGroupTemplateScaleIngredient> existingByIng = new LinkedHashMap<>();
        if (t.getScaleIngredients() != null) {
            for (OptionGroupTemplateScaleIngredient ex : t.getScaleIngredients()) {
                if (ex.getIngredientId() != null && !existingByIng.containsKey(ex.getIngredientId())) {
                    existingByIng.put(ex.getIngredientId(), ex);
                }
            }
        }

        Set<Long> keepIds = new HashSet<>();
        for (Map.Entry<Long, ScaleIngredientRequest> e : incomingByIng.entrySet()) {
            Long ingId = e.getKey();
            ScaleIngredientRequest sir = e.getValue();
            keepIds.add(ingId);
            OptionGroupTemplateScaleIngredient entity = existingByIng.get(ingId);
            if (entity == null) {
                entity = new OptionGroupTemplateScaleIngredient();
                entity.setOptionGroupTemplate(t);
                entity.setIngredientId(ingId);
                t.getScaleIngredients().add(entity);
            }
            entity.setAnchorValue(sir.anchorValue != null && sir.anchorValue > 0 ? sir.anchorValue : 1.0);
            entity.setTargetQty(sir.targetQty != null && sir.targetQty >= 0 ? sir.targetQty : 0.0);
        }

        t.getScaleIngredients().removeIf(ex -> ex.getIngredientId() == null || !keepIds.contains(ex.getIngredientId()));
    }

    // ── DTOs ──

    public record CreateTemplateRequest(
            String key, String title, String type, String presentation,
            Integer minSelect, Integer maxSelect,
            Integer minTotalQty, Integer maxTotalQty,
            Integer rangeMin, Integer rangeMax,
            String pricingMode, BigDecimal pricePerUnit,
            Boolean allowSameOptionTwice, Integer sortOrder, Boolean isActive,
            Long stockIngredientId, Integer stockScaleBase,
            List<ScaleIngredientRequest> scaleIngredients,
            List<ItemRequest> items
    ) {}

    public record ItemRequest(
            String title, BigDecimal priceDelta, Integer sortOrder,
            Integer perOptionMaxQty, Integer valueInt, Boolean isDefault,
            Long stockIngredientId, Double stockQtyPerUnit,
            List<ItemIngredientRequest> extraIngredients
    ) {}

    public record ItemIngredientRequest(Long ingredientId, Double qtyPerUnit) {}

    public record ScaleIngredientRequest(Long ingredientId, Double anchorValue, Double targetQty) {}

    public record TemplateDto(
            Long id, String key, String title, String type, String presentation,
            Integer minSelect, Integer maxSelect,
            Integer minTotalQty, Integer maxTotalQty,
            Integer rangeMin, Integer rangeMax,
            String pricingMode, BigDecimal pricePerUnit,
            Boolean allowSameOptionTwice, Integer sortOrder, Boolean isActive,
            Long stockIngredientId, Integer stockScaleBase,
            List<ScaleIngredientDto> scaleIngredients,
            List<ItemDto> items
    ) {
        static TemplateDto from(OptionGroupTemplate t) {
            List<ScaleIngredientDto> scale = t.getScaleIngredients() == null ? List.of()
                    : t.getScaleIngredients().stream()
                    .map(si -> new ScaleIngredientDto(si.getIngredientId(), si.getAnchorValue(), si.getTargetQty()))
                    .toList();
            return new TemplateDto(
                    t.getId(), t.getKey(), t.getTitle(),
                    t.getType().name(), t.getPresentation().name(),
                    t.getMinSelect(), t.getMaxSelect(),
                    t.getMinTotalQty(), t.getMaxTotalQty(),
                    t.getRangeMin(), t.getRangeMax(),
                    t.getPricingMode() != null ? t.getPricingMode().name() : null,
                    t.getPricePerUnit(), t.getAllowSameOptionTwice(),
                    t.getSortOrder(), t.getIsActive(),
                    t.getStockIngredientId(),
                    t.getStockScaleBase() != null ? t.getStockScaleBase() : 1,
                    scale,
                    t.getItems().stream().map(ItemDto::from).toList()
            );
        }
    }

    public record ScaleIngredientDto(Long ingredientId, Double anchorValue, Double targetQty) {}

    public record ItemDto(Long id, String title, BigDecimal priceDelta, Integer sortOrder,
                          Integer perOptionMaxQty, Integer valueInt, Boolean isDefault,
                          Long stockIngredientId, Double stockQtyPerUnit,
                          List<ItemIngredientDto> extraIngredients) {
        static ItemDto from(OptionItemTemplate i) {
            List<ItemIngredientDto> extra = i.getExtraIngredients() != null
                    ? i.getExtraIngredients().stream()
                    .map(e -> new ItemIngredientDto(e.getIngredientId(), e.getQtyPerUnit()))
                    .toList()
                    : List.of();
            return new ItemDto(i.getId(), i.getTitle(), i.getPriceDelta(),
                    i.getSortOrder(), i.getPerOptionMaxQty(), i.getValueInt(), i.getIsDefault(),
                    i.getStockIngredientId(), i.getStockQtyPerUnit(), extra);
        }
    }

    public record ItemIngredientDto(Long ingredientId, Double qtyPerUnit) {}

    public record DishOptionGroupDto(
            Long groupInstanceId, Long templateId, String title, String type, String presentation,
            DishOptionRulesDto rules, List<DishOptionItemDto> items,
            Long stockIngredientId, Integer stockScaleBase,
            List<ScaleIngredientDto> scaleIngredients
    ) {}

    public record DishOptionRulesDto(
            Integer minSelect, Integer maxSelect,
            Integer minTotalQty, Integer maxTotalQty,
            Integer rangeMin, Integer rangeMax,
            String pricingMode, BigDecimal pricePerUnit, Boolean allowSameOptionTwice
    ) {}

    public record DishOptionItemDto(
            Long optionItemId,
            String title,
            BigDecimal priceDelta,
            Integer perOptionMaxQty,
            Integer valueInt,
            Boolean isDefault,
            Long stockIngredientId,
            Double stockQtyPerUnit,
            List<ItemIngredientDto> extraIngredients
    ) {}
}
