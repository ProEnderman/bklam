package com.restaurant.service;

import com.restaurant.dto.*;
import com.restaurant.exception.BusinessException;
import com.restaurant.model.Ingredient;
import com.restaurant.model.Unit;
import com.restaurant.repository.IngredientRepository;
import com.restaurant.security.SecurityUtils;
import com.restaurant.util.UnicodeSubstringSearch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExcelUploadService {

    /**
     * {@code dbExactMatchIngredientIds}: rows from {@link IngredientRepository#findForStockExcelExactNameMatch};
     * they must not be dropped by any Java-side name filter (DB already matched this row).
     */
    private record IngredientNameResolution(List<Ingredient> candidates, Set<Long> dbExactMatchIngredientIds) {}

    /** Простое сравнение имён для импорта: NFC, trim, NBSP→space, схлопывание пробелов, lower(ROOT). */
    private static String squashIngredientLabel(String raw) {
        if (raw == null) {
            return "";
        }
        String s = Normalizer.normalize(raw.trim(), Normalizer.Form.NFC)
            .replace('\u00A0', ' ')
            .toLowerCase(Locale.ROOT);
        return s.replaceAll("\\s+", " ").trim();
    }

    private static boolean sameNameForStockExcel(String dbName, String excelName) {
        return squashIngredientLabel(dbName).equals(squashIngredientLabel(excelName));
    }

    /** Результат LIKE: «Авокадо пюре» для строки Excel «Авокадо». */
    private static boolean compoundNamePrefixForStockExcel(String dbName, String excelName) {
        String a = squashIngredientLabel(dbName);
        String b = squashIngredientLabel(excelName);
        return !b.isEmpty() && a.startsWith(b + " ") && a.length() > b.length() + 3;
    }

    private final IngredientRepository ingredientRepository;
    private final IngredientService ingredientService;
    private final StockService stockService;
    private final ActivityLogService activityLogService;
    /** Отображаемое значение ячейки (в т.ч. FORMULA по кэшу), а не строка формулы — иначе имя из Excel ≠ справочник. */
    private final DataFormatter cellFormatter = new DataFormatter();
    
    /**
     * One transaction so the tenant JDBC connection keeps {@code SET LOCAL app.current_restaurant_id}
     * for the whole import (matches RLS) and all stock updates commit consistently.
     */
    @Transactional(rollbackFor = Exception.class)
    public ExcelUploadResponse processExcelFile(MultipartFile file,
                                                 Map<String, ResolveUnitMismatchRequest> unitMismatchResolutions,
                                                 Map<String, Unit> missingUnitResolutions,
                                                 Map<String, ResolveIngredientMissingRequest> missingIngredientResolutions) {
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.UPLOAD_EXCEL)) {
            throw new BusinessException("You don't have permission to upload Excel files");
        }
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }
        
        List<ExcelUploadRow> rows = parseExcelFile(file);
        log.info("Excel upload: parsed {} rows (each quantity = stock IN delta)", rows.size());
        for (int i = 0; i < Math.min(3, rows.size()); i++) {
            ExcelUploadRow r = rows.get(i);
            log.info("Excel upload: sample row {} -> name='{}', unit={}, quantity={}", i + 1, r.item(), r.unit(), r.quantity());
        }
        
        int processedCount = 0;
        int createdCount = 0;
        int updatedCount = 0;
        List<ExcelUploadError> errors = new ArrayList<>();
        
        for (ExcelUploadRow dataRow : rows) {
            String rawItem = dataRow.item();
            if (rawItem == null || rawItem.trim().isEmpty()) {
                continue;
            }
            String rawNormalized = normalizeName(rawItem);
            if (rawNormalized == null || rawNormalized.isEmpty()) continue;
            final String itemName = Normalizer.normalize(rawNormalized, Normalizer.Form.NFC).trim();
            if (itemName.isEmpty()) continue;

            Double requestedMinQtyForNew = null;
            int displayRowNumber = dataRow.spreadsheetRowNumber() != null
                ? dataRow.spreadsheetRowNumber()
                : processedCount + 2;

            Double quantity = dataRow.quantity() != null && dataRow.quantity() > 0 ? dataRow.quantity() : 0.0;
            
            Unit unitToUse = dataRow.unit();
            
            // Сначала проверяем, есть ли уже товар с таким же именем И unit
            // Это важно, чтобы не показывать ошибку, если товар с таким unit уже был создан
            Ingredient existing = null;
            
            // Ищем ингредиент: сначала точный name_search_key, затем lower(trim(name)) для строк без ключа,
            // затем LIKE (огранич. размер страницы) — иначе импорт «не видит» товары из справочника.
            IngredientNameResolution nameHits = resolveIngredientsMatchingExcelName(restaurantId, itemName);
            List<Ingredient> ingredientsWithSameName = nameHits.candidates().stream()
                .filter(ing -> {
                    if (nameHits.dbExactMatchIngredientIds().contains(ing.getId())) {
                        return true;
                    }
                    String ingName = ing.getName();
                    if (ingName == null || ingName.isEmpty()) {
                        return false;
                    }
                    return sameNameForStockExcel(ingName, itemName)
                        || compoundNamePrefixForStockExcel(ingName, itemName);
                })
                .collect(Collectors.toList());
            
            // Если unit указан в Excel, ищем товар с таким же unit
            if (unitToUse != null) {
                final Unit searchUnit = unitToUse; // Создаем финальную копию для использования в лямбде
                existing = ingredientsWithSameName.stream()
                    .filter(ing -> ing.getUnit().equals(searchUnit))
                    .findFirst()
                    .orElse(null);
            }
            
            // Если не нашли по unit, ищем по точному имени (для обратной совместимости)
            if (existing == null) {
                existing = ingredientsWithSameName.stream()
                    .filter(ing -> ing.getName() != null && sameNameForStockExcel(ing.getName(), itemName))
                    .findFirst()
                    .orElse(null);
            }
            
            // Если unit не указан в Excel
            if (unitToUse == null) {
                if (existing != null) {
                    // Если товар существует, используем его unit
                    unitToUse = existing.getUnit();
                } else {
                    // Если товара нет, проверяем разрешение
                    Unit resolvedUnit = missingUnitResolutions.get(itemName);
                    if (resolvedUnit == null) {
                        errors.add(new ExcelUploadError(itemName, "UNIT_MISSING", null, null, displayRowNumber));
                        continue;
                    }
                    unitToUse = resolvedUnit;
                }
            }

            ResolveUnitMismatchRequest umForCreate = unitMismatchResolutions.get(itemName);
            boolean creatingFromUnitMismatch = umForCreate != null && !umForCreate.updateExisting();

            if (existing == null && unitToUse != null && !creatingFromUnitMismatch) {
                ResolveIngredientMissingRequest im = missingIngredientResolutions.get(itemName);
                if (im == null) {
                    errors.add(new ExcelUploadError(itemName, "INGREDIENT_MISSING", null, unitToUse, displayRowNumber));
                    continue;
                }
                if (!im.createNew()) {
                    continue;
                }
                requestedMinQtyForNew = im.minQty() != null && im.minQty() >= 0 ? im.minQty() : 0.0;
            }

            // Если товар существует, проверяем unit
            if (existing != null) {
                if (!existing.getUnit().equals(unitToUse)) {
                    // Проверяем, может быть уже есть товар с таким unit (с модифицированным именем)
                    final Unit searchUnit = unitToUse; // Создаем финальную копию для использования в лямбде
                    String modifiedName = itemName + " (" + searchUnit + ")";
                    Ingredient existingWithModifiedName = ingredientsWithSameName.stream()
                        .filter(ing -> ing.getName() != null
                                && sameNameForStockExcel(ing.getName(), modifiedName)
                                && ing.getUnit().equals(searchUnit))
                        .findFirst()
                        .orElse(null);
                    
                    if (existingWithModifiedName != null) {
                        // Товар с таким unit уже существует (был создан ранее), используем его
                        log.info("Found existing ingredient with modified name '{}' and unit {}, will use it", 
                            modifiedName, unitToUse);
                        existing = existingWithModifiedName;
                    } else {
                        // Проверяем разрешение конфликта
                        ResolveUnitMismatchRequest resolution = unitMismatchResolutions.get(itemName);
                        log.debug("Checking resolution for item '{}': {}", itemName, resolution);
                        if (resolution == null) {
                            errors.add(new ExcelUploadError(itemName, "UNIT_MISMATCH", 
                                existing.getUnit(), unitToUse, displayRowNumber));
                            continue;
                        }
                        
                        log.info("Resolution found for '{}': updateExisting={}, chosenUnit={}", 
                            itemName, resolution.updateExisting(), resolution.chosenUnit());
                        
                        Unit chosenUnit = resolution.chosenUnit();
                        if (resolution.updateExisting()) {
                            // Обновляем unit существующего товара
                            IngredientDto updateDto = new IngredientDto(
                                existing.getId(),
                                existing.getName(),
                                chosenUnit,
                                existing.getStockQty(),
                                existing.getMinQty()
                            );
                            ingredientService.updateIngredient(existing.getId(), updateDto);
                            existing.setUnit(chosenUnit);
                            unitToUse = chosenUnit;
                            log.info("Updated existing ingredient '{}' unit to {}", itemName, unitToUse);
                        } else {
                            // Используем unit из Excel для нового товара
                            unitToUse = chosenUnit;
                            existing = null; // Будем создавать новый товар
                            log.info("Will create new ingredient '{}' with unit {} (updateExisting=false)", itemName, unitToUse);
                        }
                    }
                }
            }
            
            // Создаем или обновляем товар
            if (existing == null) {
                // Проверяем, было ли явное разрешение на создание нового товара
                ResolveUnitMismatchRequest resolution = unitMismatchResolutions.get(itemName);
                boolean shouldCreateNew = resolution != null && !resolution.updateExisting();
                
                log.debug("Processing item '{}': existing=null, shouldCreateNew={}, resolution={}", 
                    itemName, shouldCreateNew, resolution);
                
                if (!shouldCreateNew) {
                    // Проверяем еще раз существование перед созданием (на случай race condition)
                    // Используем регистронезависимый поиск
                    boolean alreadyExists = ingredientRepository.existsByNameIgnoreCase(
                        restaurantId, UnicodeSubstringSearch.normalizeSearchKey(itemName)
                    );
                    
                    log.debug("Item '{}' already exists check: {}", itemName, alreadyExists);
                    
                    if (alreadyExists) {
                        // Если ингредиент уже существует, пытаемся его найти снова
                        existing = ingredientRepository.findByRestaurantIdAndNameSearchKey(
                            restaurantId, UnicodeSubstringSearch.normalizeSearchKey(itemName)
                        ).orElse(null);
                        
                        if (existing == null) {
                            // Если все еще не нашли, добавляем в ошибки
                            errors.add(new ExcelUploadError(itemName, "DUPLICATE", null, null, displayRowNumber));
                            log.warn("Ingredient '{}' exists but could not be found for restaurant {}", itemName, restaurantId);
                            continue;
                        }
                        log.debug("Found existing ingredient '{}' after re-check", itemName);
                    }
                } else {
                    log.info("Will create new ingredient '{}' because shouldCreateNew=true (user chose to create new)", itemName);
                }
                
                // Если existing все еще null, создаем новый товар
                if (existing == null) {
                    // Создаем новый товар с модифицированным именем, если товар с таким именем уже существует
                    String finalItemName = itemName;
                    if (shouldCreateNew) {
                        // Проверяем, существует ли товар с таким именем
                        boolean nameExists = ingredientRepository.existsByNameIgnoreCase(
                            restaurantId, UnicodeSubstringSearch.normalizeSearchKey(itemName));
                        log.debug("Checking if name '{}' exists for new ingredient: {}", itemName, nameExists);
                        if (nameExists) {
                            // Добавляем unit к имени, чтобы создать уникальный товар
                            finalItemName = itemName + " (" + unitToUse + ")";
                            log.info("Creating new ingredient with modified name: '{}' (original: '{}')", finalItemName, itemName);
                        }
                    }
                    
                    // Минимальный остаток не задаётся из файла — один на ингредиент (имя+unit)
                    IngredientDto newDto = new IngredientDto(
                        null,
                        finalItemName,
                        unitToUse,
                        quantity,
                        requestedMinQtyForNew != null ? requestedMinQtyForNew : 0.0
                    );
                    log.info("Attempting to create new ingredient: name='{}', unit={}, qty={}", 
                        finalItemName, unitToUse, quantity);
                    try {
                        ingredientService.createIngredient(newDto);
                        createdCount++;
                        log.info("Successfully created new ingredient: '{}' with unit {}", finalItemName, unitToUse);
                    } catch (BusinessException e) {
                        log.error("Failed to create ingredient '{}': {}", finalItemName, e.getMessage());
                        // Если ингредиент уже существует (race condition), пытаемся найти его
                        if (e.getMessage().contains("already exists")) {
                            existing = ingredientRepository.findByRestaurantIdAndNameSearchKey(
                                restaurantId, UnicodeSubstringSearch.normalizeSearchKey(finalItemName)
                            ).orElse(null);
                            
                            if (existing == null) {
                                errors.add(new ExcelUploadError(itemName, "DUPLICATE", null, null, displayRowNumber));
                                log.warn("Failed to create ingredient '{}': {}", finalItemName, e.getMessage());
                                continue;
                            }
                            // Продолжаем с существующим ингредиентом
                            log.info("Found existing ingredient '{}' after creation failed, will update instead", finalItemName);
                        } else {
                            throw e; // Пробрасываем другие ошибки
                        }
                    }
                }
            }
            
            if (existing != null) {
                applyInventoryAdditiveFromExcel(existing, quantity, itemName);
                updatedCount++;
            }
            
            processedCount++;
        }
        
        try {
            Map<String, Object> newValues = new HashMap<>();
            newValues.put("processedCount", processedCount);
            newValues.put("createdCount", createdCount);
            newValues.put("updatedCount", updatedCount);
            newValues.put("errorsCount", errors.size());
            newValues.put("stockImportMode", "STOCK_IN_PER_ROW");
            activityLogService.logActivity(
                "EXCEL_UPLOAD", "INGREDIENT", null, null,
                String.format("Загрузка Excel: обработано %d, создано %d, обновлено %d, ошибок %d",
                    processedCount, createdCount, updatedCount, errors.size()),
                null, newValues
            );
        } catch (Exception e) {
            log.error("Failed to log excel upload activity: {}", e.getMessage());
        }
        
        if (errors.isEmpty()) {
            return ExcelUploadResponse.success(processedCount, createdCount, updatedCount);
        } else {
            return ExcelUploadResponse.withErrors(processedCount, createdCount, updatedCount, errors);
        }
    }

    /**
     * Находит строки справочника для строки Excel: точный {@code name_search_key}, затем {@code lower(trim(name))}
     * (старые строки без ключа), затем подстрочный LIKE с лимитом страницы.
     */
    private IngredientNameResolution resolveIngredientsMatchingExcelName(Long restaurantId, String itemName) {
        LinkedHashMap<Long, Ingredient> byId = new LinkedHashMap<>();
        Set<Long> exactSqlIds = new HashSet<>();
        String normKey = UnicodeSubstringSearch.normalizeSearchKey(itemName);
        for (Ingredient i : ingredientRepository.findForStockExcelExactNameMatch(restaurantId, normKey, itemName)) {
            byId.put(i.getId(), i);
            exactSqlIds.add(i.getId());
        }
        if (byId.isEmpty()) {
            String likePat = UnicodeSubstringSearch.sqlLikeSubstringPattern(itemName);
            if (likePat != null) {
                for (Ingredient i : ingredientRepository.searchIngredients(
                        restaurantId,
                        likePat,
                        "false",
                        org.springframework.data.domain.PageRequest.of(0, 200)).getContent()) {
                    byId.putIfAbsent(i.getId(), i);
                }
            }
        }
        return new IngredientNameResolution(new ArrayList<>(byId.values()), exactSqlIds);
    }

    /**
     * Парсит Excel для загрузки поступлений на склад (Stock).
     * Колонка количества — объём прихода (прибавляется к остатку), не «целевой остаток».
     * Формат строки: название, unit, количество (порядок unit/qty как в выгрузке — см. автоопределение).
     */
    public List<ExcelUploadRow> parseExcelFile(MultipartFile file) {
        List<ExcelUploadRow> rows = new ArrayList<>();
        
        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            FormulaEvaluator formulaEvaluator = workbook.getCreationHelper().createFormulaEvaluator();

            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                String item = normalizeName(getCellValueAsString(row.getCell(0), formulaEvaluator));
                String col1 = getCellValueAsString(row.getCell(1), formulaEvaluator);
                String col2 = getCellValueAsString(row.getCell(2), formulaEvaluator);
                Double qtyFromCol1 = getCellValueAsDouble(row.getCell(1));
                Double qtyFromCol2 = getCellValueAsDouble(row.getCell(2));
                
                if (item == null || item.isEmpty()) {
                    continue;
                }
                
                Unit unit;
                Double quantity;
                // Автоопределение порядка: (название, unit, количество) или (название, количество, unit)
                if (parseUnit(col1, i + 1) != null && (qtyFromCol2 != null || (col2 != null && !col2.trim().isEmpty()))) {
                    unit = parseUnit(col1, i + 1);
                    quantity = qtyFromCol2 != null ? qtyFromCol2 : parseDoubleSafe(col2);
                } else if (qtyFromCol1 != null && parseUnit(col2, i + 1) != null) {
                    quantity = qtyFromCol1;
                    unit = parseUnit(col2, i + 1);
                } else {
                    unit = parseUnit(col1, i + 1);
                    if (unit == null) unit = parseUnit(col2, i + 1);
                    quantity = qtyFromCol2 != null ? qtyFromCol2 : qtyFromCol1;
                    if (quantity == null) quantity = parseDoubleSafe(col2);
                    if (quantity == null) quantity = parseDoubleSafe(col1);
                }
                // Если в 3-й колонке 0/пусто — пробуем 4-ю (на случай лишней колонки или другого шаблона)
                if ((quantity == null || quantity == 0) && row.getCell(3) != null) {
                    Double q3 = getCellValueAsDouble(row.getCell(3));
                    if (q3 != null && q3 > 0) quantity = q3;
                }
                rows.add(new ExcelUploadRow(item, quantity, unit, null, i + 1));
            }
        } catch (IOException e) {
            throw new BusinessException("Failed to parse Excel file: " + e.getMessage());
        }
        
        return rows;
    }

    /**
     * Excel / браузеры часто вставляют ZWSP, ZWNJ и т.п. — визуально «Авокадо», но не совпадает со справочником.
     */
    private static String stripInvisibleUtf(String s) {
        if (s == null || s.isEmpty()) {
            return s;
        }
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            if (cp != 0x200B && cp != 0x200C && cp != 0x200D && cp != 0xFEFF && cp != 0x2060 && cp != 0x00AD) {
                sb.appendCodePoint(cp);
            }
            i += Character.charCount(cp);
        }
        return sb.toString();
    }

    private static String normalizeName(String s) {
        if (s == null) return null;
        s = stripInvisibleUtf(s.replace('\uFEFF', ' ')).trim();
        return s.isEmpty() ? null : s;
    }

    private static Double parseDoubleSafe(String s) {
        if (s == null || s.trim().isEmpty()) return null;
        try {
            return Double.parseDouble(s.trim().replace(',', '.'));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Double getCellValueAsDouble(Cell cell) {
        if (cell == null) return null;
        switch (cell.getCellType()) {
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) return null;
                double v = cell.getNumericCellValue();
                return v >= 0 ? v : null;
            case STRING:
                String str = cell.getStringCellValue();
                if (str == null || str.trim().isEmpty()) return null;
                try {
                    return Double.parseDouble(str.trim().replace(',', '.'));
                } catch (NumberFormatException e) {
                    return null;
                }
            case FORMULA:
                if (cell.getCachedFormulaResultType() == org.apache.poi.ss.usermodel.CellType.NUMERIC) {
                    double v2 = cell.getNumericCellValue();
                    return v2 >= 0 ? v2 : null;
                }
                return null;
            default:
                return null;
        }
    }

    /**
     * Импорт шаблона «ингредиенты»: находим строку справочника так же надёжно, как для склада
     * ({@link #resolveIngredientsMatchingExcelName}), а не только по {@code name_search_key} —
     * иначе при расхождении ключа и имени из Excel сервер пытается CREATE и получает дубликат ({@code CREATE_FAILED}).
     * Составные имена («Айоли …») по префиксу не матчим — чтобы «Айоли» не схватило «Айоли трюфельный».
     */
    private Ingredient findExistingIngredientForIngredientsTemplate(Long restaurantId, String itemName, Unit unit) {
        var byKey = ingredientRepository.findByRestaurantIdAndNameSearchKey(
            restaurantId, UnicodeSubstringSearch.normalizeSearchKey(itemName));
        if (byKey.isPresent()) {
            return byKey.get();
        }
        IngredientNameResolution res = resolveIngredientsMatchingExcelName(restaurantId, itemName);
        List<Ingredient> exactVisual = res.candidates().stream()
            .filter(ing -> {
                if (res.dbExactMatchIngredientIds().contains(ing.getId())) {
                    return true;
                }
                return ing.getName() != null && sameNameForStockExcel(ing.getName(), itemName);
            })
            .collect(Collectors.toList());
        if (exactVisual.isEmpty()) {
            return null;
        }
        return exactVisual.stream()
            .filter(ing -> ing.getUnit().equals(unit))
            .findFirst()
            .orElseGet(() -> exactVisual.stream().findFirst().orElse(null));
    }

    /**
     * Import ingredients list from a simplified Excel template:
     * 1) name, 2) unit, 3) minimum quantity.
     *
     * Creates new ingredients or updates existing (by case-insensitive exact name match within restaurant).
     * Stock quantity is not affected.
     */
    @Transactional(rollbackFor = Exception.class)
    public ExcelUploadResponse processIngredientsExcelTemplate(MultipartFile file) {
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.UPLOAD_EXCEL)) {
            throw new BusinessException("You don't have permission to upload Excel files");
        }

        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }

        List<ExcelUploadRow> rows = parseIngredientsExcelTemplate(file);

        int processedCount = 0;
        int createdCount = 0;
        int updatedCount = 0;
        List<ExcelUploadError> errors = new ArrayList<>();

        for (int idx = 0; idx < rows.size(); idx++) {
            ExcelUploadRow row = rows.get(idx);
            int rowNumber = idx + 2; // + header row

            if (row.item() == null || row.item().trim().isEmpty()) {
                continue;
            }
            String name = Normalizer.normalize(row.item().trim(), Normalizer.Form.NFC);
            Unit unit = row.unit();
            if (unit == null) {
                errors.add(new ExcelUploadError(name, "UNIT_MISSING", null, null, rowNumber));
                continue;
            }
            double minQty = row.minQty() != null && row.minQty() >= 0 ? row.minQty() : 0.0;

            processedCount++;

            Ingredient existing = findExistingIngredientForIngredientsTemplate(restaurantId, name, unit);
            if (existing == null) {
                try {
                    ingredientService.createIngredient(new IngredientDto(null, name, unit, 0.0, minQty));
                    createdCount++;
                } catch (Exception e) {
                    log.warn("Ingredient excel create failed row {} name={}: {}", rowNumber, name, e.getMessage(), e);
                    errors.add(new ExcelUploadError(name, "CREATE_FAILED", null, unit, rowNumber));
                }
            } else {
                try {
                    ingredientService.updateIngredient(existing.getId(), new IngredientDto(
                        existing.getId(),
                        name,
                        unit,
                        existing.getStockQty(),
                        minQty
                    ));
                    updatedCount++;
                } catch (Exception e) {
                    log.warn("Ingredient excel update failed row {} name={}: {}", rowNumber, name, e.getMessage(), e);
                    errors.add(new ExcelUploadError(name, "UPDATE_FAILED", existing.getUnit(), unit, rowNumber));
                }
            }
        }

        // Activity log (best-effort)
        try {
            activityLogService.logActivity(
                "EXCEL_UPLOAD",
                "INGREDIENT",
                null,
                "system",
                String.format("Импорт ингредиентов из Excel: обработано %d, создано %d, обновлено %d", processedCount, createdCount, updatedCount),
                null,
                Map.of("processed", processedCount, "created", createdCount, "updated", updatedCount, "errors", errors.size())
            );
        } catch (Exception e) {
            log.error("Failed to log ingredients excel upload activity: {}", e.getMessage());
        }

        if (errors.isEmpty()) {
            return ExcelUploadResponse.success(processedCount, createdCount, updatedCount);
        }
        return ExcelUploadResponse.withErrors(processedCount, createdCount, updatedCount, errors);
    }

    private List<ExcelUploadRow> parseIngredientsExcelTemplate(MultipartFile file) {
        List<ExcelUploadRow> rows = new ArrayList<>();
        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            FormulaEvaluator formulaEvaluator = workbook.getCreationHelper().createFormulaEvaluator();
            // header row is optional; we still skip first row
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                String item = getCellValueAsString(row.getCell(0), formulaEvaluator);
                String unitStr = getCellValueAsString(row.getCell(1), formulaEvaluator);
                String minQtyStr = getCellValueAsString(row.getCell(2), formulaEvaluator);

                if (item == null || item.trim().isEmpty()) continue;
                item = stripInvisibleUtf(item).trim();
                if (item.isEmpty()) continue;

                Unit unit = parseUnit(unitStr, i + 1);
                Double minQty = null;
                try {
                    if (minQtyStr != null && !minQtyStr.trim().isEmpty()) {
                        minQty = Double.parseDouble(minQtyStr.trim());
                        if (minQty < 0) minQty = 0.0;
                    }
                } catch (NumberFormatException e) {
                    log.warn("Invalid minQty value at row {}: {}", i + 1, minQtyStr);
                }

                rows.add(new ExcelUploadRow(item.trim(), null, unit, minQty, i + 1));
            }
        } catch (IOException e) {
            throw new BusinessException("Failed to parse Excel file: " + e.getMessage());
        }
        return rows;
    }

    private Unit parseUnit(String unitStr, int rowNumber) {
        if (unitStr == null || unitStr.trim().isEmpty()) return null;
        String s = unitStr.trim().toUpperCase();
        return switch (s) {
            case "G", "GRAM", "GRAMS", "Г", "ГРАММ", "ГРАММЫ" -> Unit.G;
            case "ML", "MILLILITER", "MILLILITERS", "МЛ", "МИЛЛИЛИТР", "МИЛЛИЛИТРЫ" -> Unit.ML;
            case "PCS", "PIECE", "PIECES", "ШТ", "ШТУКА", "ШТУКИ" -> Unit.PCS;
            default -> {
                log.warn("Unknown unit value at row {}: {}", rowNumber, s);
                yield null;
            }
        };
    }
    
    private String getCellValueAsString(Cell cell, FormulaEvaluator formulaEvaluator) {
        if (cell == null) {
            return null;
        }
        try {
            // Для FORMULA нужен evaluator — иначе DataFormatter часто возвращает текст формулы, а не значение.
            String s = cellFormatter.formatCellValue(cell, formulaEvaluator);
            if (s == null) {
                return null;
            }
            s = s.trim();
            return s.isEmpty() ? null : s;
        } catch (Exception e) {
            log.warn("getCellValueAsString: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Колонка количества в Excel = объём прихода (stock IN). Повторная загрузка того же файла снова прибавит те же объёмы.
     */
    private void applyInventoryAdditiveFromExcel(Ingredient existing, double addQty, String itemName) {
        if (addQty <= 0) {
            log.info("Excel stock import: row '{}' -> ingredientId={}, skip non-positive qty ({})",
                itemName, existing.getId(), addQty);
            return;
        }
        log.info("Excel stock import: row '{}' -> ingredientId={}, stock IN by {}",
            itemName, existing.getId(), addQty);
        stockService.stockIn(new StockInRequest(
            existing.getId(),
            addQty,
            "Excel import stock IN: +" + addQty
        ));
    }

    /**
     * Выгрузка текущих остатков в Excel (справочно: текущие qty). Импорт из Excel трактует колонку количества как приход, не как эти числа «установить».
     * Формат: первая строка — заголовок (Название, Единица измерения, Количество), со 2-й — данные.
     */
    @Transactional(readOnly = true)
    public byte[] exportStockToExcel() {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }
        List<Ingredient> ingredients = ingredientRepository.searchIngredients(
            restaurantId, null, "false",
            org.springframework.data.domain.PageRequest.of(0, 50_000)
        ).getContent();
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Остатки");
            Row headerRow = sheet.createRow(0);
            headerRow.createCell(0).setCellValue("Название");
            headerRow.createCell(1).setCellValue("Единица измерения");
            headerRow.createCell(2).setCellValue("Количество");
            int rowNum = 1;
            for (Ingredient ing : ingredients) {
                Row row = sheet.createRow(rowNum++);
                row.createCell(0).setCellValue(ing.getName());
                row.createCell(1).setCellValue(ing.getUnit().name());
                Cell qtyCell = row.createCell(2);
                qtyCell.setCellValue(ing.getStockQty() != null ? ing.getStockQty() : 0.0);
            }
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new BusinessException("Failed to build Excel: " + e.getMessage());
        }
    }

    /**
     * Export ingredients catalog (name, unit, min qty) — same columns as {@link #processIngredientsExcelTemplate}.
     */
    @Transactional(readOnly = true)
    public byte[] exportIngredientsCatalogToExcel() {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }
        List<Ingredient> ingredients = ingredientRepository.searchIngredients(
            restaurantId, null, "false",
            org.springframework.data.domain.PageRequest.of(0, 50_000)
        ).getContent();
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Ингредиенты");
            Row headerRow = sheet.createRow(0);
            headerRow.createCell(0).setCellValue("Name");
            headerRow.createCell(1).setCellValue("Unit");
            headerRow.createCell(2).setCellValue("Min Quantity");
            int rowNum = 1;
            for (Ingredient ing : ingredients) {
                Row row = sheet.createRow(rowNum++);
                row.createCell(0).setCellValue(ing.getName());
                row.createCell(1).setCellValue(ing.getUnit().name());
                Cell minCell = row.createCell(2);
                minCell.setCellValue(ing.getMinQty() != null ? ing.getMinQty() : 0.0);
            }
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new BusinessException("Failed to build Excel: " + e.getMessage());
        }
    }
}

