package com.restaurant.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.restaurant.dto.IngredientUsageDto;
import com.restaurant.dto.ProblemIngredientDto;
import com.restaurant.dto.ShiftDtos;
import com.restaurant.dto.TopDishDto;
import com.restaurant.exception.BusinessException;
import com.restaurant.model.*;
import com.restaurant.repository.ActivityLogRepository;
import com.restaurant.repository.DishRepository;
import com.restaurant.repository.TariffRuleRepository;
import com.restaurant.security.SecurityUtils;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Сводные отчёты для Excel / Google Sheets: один XLSX с листами или ZIP (XLSX + отдельные CSV).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RestaurantDataExportService {

    private final AnalyticsService analyticsService;
    private final OrderService orderService;
    private final BookingService bookingService;
    private final ActivityLogRepository activityLogRepository;
    private final ShiftService shiftService;
    private final DishRepository dishRepository;
    private final TariffRuleRepository tariffRuleRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @PersistenceContext
    private EntityManager entityManager;

    private static final int ACTIVITY_PAGE = 2000;
    private static final int MAX_ACTIVITY_PAGES = 100;

    @Transactional(readOnly = true)
    public byte[] export(String format, LocalDate from, LocalDate to, Long restaurantId) {
        String f = format == null ? "xlsx" : format.trim().toLowerCase(Locale.ROOT);
        return switch (f) {
            case "xlsx", "xls" -> exportWorkbook(from, to, restaurantId);
            case "zip", "csv" -> exportZipBundle(from, to, restaurantId);
            default -> throw new BusinessException("Поддерживаются форматы: xlsx, zip (архив XLSX + CSV). Передано: " + format);
        };
    }

    @Transactional(readOnly = true)
    public byte[] exportWorkbook(LocalDate from, LocalDate to, Long restaurantId) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            writeWorkbook(out, from, to, restaurantId);
            return out.toByteArray();
        } catch (IOException e) {
            log.error("export workbook failed", e);
            throw new BusinessException("Ошибка формирования XLSX: " + e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public byte[] exportZipBundle(LocalDate from, LocalDate to, Long restaurantId) {
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(bos)) {
                zos.putNextEntry(new ZipEntry("readme.txt"));
                zos.write(readmeText(from, to, restaurantId).getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();

                zos.putNextEntry(new ZipEntry("full_report.xlsx"));
                writeWorkbook(zos, from, to, restaurantId);
                zos.closeEntry();

                addZip(zos, "orders_line_items.csv", safeExport(() -> orderService.exportOrdersToCsv(from, to)));
                Long bid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
                LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(2000, 1, 1, 0, 0);
                LocalDateTime toDt = to != null ? to.atTime(23, 59, 59) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
                addZip(zos, "bookings.csv", safeExport(() -> bookingService.exportBookingsToCsv(bid, fromDt, toDt)));
                addZip(zos, "stock_movements.csv", safeExport(() -> exportStockMovementsCsv(from, to)));
                addZip(zos, "activity_log.csv", safeExport(() -> exportActivityLogCsv(from, to)));
                addZip(zos, "shifts.csv", safeExport(() -> exportShiftsCsv(from, to, restaurantId)));
            }
            return bos.toByteArray();
        } catch (IOException e) {
            log.error("export zip failed", e);
            throw new BusinessException("Ошибка формирования ZIP: " + e.getMessage());
        }
    }

    private String readmeText(LocalDate from, LocalDate to, Long restaurantId) {
        return """
                Экспорт данных ресторана
                Период: %s — %s
                restaurantId (если задан): %s

                full_report.xlsx — сводные листы (выручка, товары, сотрудники, брони/тарифы, склад, журнал, смены, меню).

                Отдельные CSV (удобно импортировать в Google Таблицы по одному файлу):
                - orders_line_items.csv — заказы и позиции
                - bookings.csv — бронирования
                - stock_movements.csv — движения склада
                - activity_log.csv — журнал действий
                - shifts.csv — смены

                Если какого-то файла нет в архиве, данных за период не было или нет прав на объект (см. лог сервера).
                """.formatted(
                from != null ? from.toString() : "—",
                to != null ? to.toString() : "—",
                restaurantId != null ? restaurantId.toString() : "текущий контекст"
        );
    }

    private void addZip(ZipOutputStream zos, String name, byte[] data) throws IOException {
        if (data == null || data.length == 0) return;
        zos.putNextEntry(new ZipEntry(name));
        zos.write(data);
        zos.closeEntry();
    }

    private byte[] safeExport(java.util.concurrent.Callable<byte[]> c) {
        try {
            return c.call();
        } catch (Exception e) {
            log.warn("export partial skip: {}", e.getMessage());
            return null;
        }
    }

    private void writeWorkbook(java.io.OutputStream out, LocalDate from, LocalDate to, Long restaurantId) throws IOException {
        Long rid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            addReadmeSheet(wb, from, to, rid);

            Map<String, Object> revenue = analyticsService.getRevenue(from, to, restaurantId);
            addTwoColumnMoneySheet(wb, "revenue_by_day", asStringBigDecimalMap(revenue.get("byDay")));
            addTwoColumnMoneySheet(wb, "revenue_by_week", asStringBigDecimalMap(revenue.get("byWeek")));
            addTwoColumnMoneySheet(wb, "revenue_by_month", asStringBigDecimalMap(revenue.get("byMonth")));
            addTwoColumnMoneySheet(wb, "revenue_by_year", asStringBigDecimalMap(revenue.get("byYear")));
            addScalarSheet(wb, "revenue_totals", Map.of(
                    "total", Objects.toString(revenue.get("total"), ""),
                    "period", Objects.toString(revenue.get("period"), "")
            ));

            Map<String, Object> products = analyticsService.getProductSalesAnalytics(from, to, restaurantId);
            addProductScalarSheet(wb, products);
            addTwoColumnMoneySheet(wb, "sales_by_category", asStringBigDecimalMap(products.get("revenueByCategory")));
            addTwoColumnLongSheet(wb, "qty_by_category", asStringLongMap(products.get("qtyByCategory")));
            addTwoColumnMoneySheet(wb, "sales_by_product", asStringBigDecimalMap(products.get("revenueByProduct")));
            addTwoColumnMoneySheet(wb, "sales_by_admin", asStringBigDecimalMap(products.get("revenueByAdmin")));
            addTwoColumnMoneySheet(wb, "sales_by_day", asStringBigDecimalMap(products.get("revenueByDay")));
            addTwoColumnMoneySheet(wb, "sales_by_week", asStringBigDecimalMap(products.get("revenueByWeek")));
            addTwoColumnMoneySheet(wb, "sales_by_month", asStringBigDecimalMap(products.get("revenueByMonth")));
            addTwoColumnMoneySheet(wb, "sales_by_year", asStringBigDecimalMap(products.get("revenueByYear")));
            addTwoColumnMoneySheet(wb, "sales_by_dow", asStringBigDecimalMap(products.get("revenueByDow")));
            addTwoColumnMoneySheet(wb, "sales_by_hour", asStringBigDecimalMap(products.get("revenueByHour")));

            addTripleNestedMoneySheets(wb, products, "revenueByAdminAndDay", "admin", "day", "revenue");
            addTripleNestedMoneySheets(wb, products, "revenueByAdminAndCategory", "admin", "category", "revenue");
            addTripleNestedMoneySheets(wb, products, "revenueByAdminAndProduct", "admin", "product", "revenue");
            addTripleNestedMoneySheets(wb, products, "revenueByDateAndCategory", "date", "category", "revenue");
            addTripleNestedMoneySheets(wb, products, "revenueByDateAndProduct", "date", "product", "revenue");

            Map<String, Object> employees = analyticsService.getEmployeeAnalytics(from, to, restaurantId);
            addTwoColumnDoubleSheet(wb, "hours_by_employee", asStringDoubleMap(employees.get("hoursByEmployee")));
            addTwoColumnDoubleSheet(wb, "hours_by_admin", asStringDoubleMap(employees.get("hoursByAdministrator")));
            addTwoColumnMoneySheet(wb, "rev_by_creator", asStringBigDecimalMap(employees.get("revenueByEmployee")));
            addTwoColumnLongSheet(wb, "orders_by_creator", asStringLongMap(employees.get("orderCountByEmployee")));
            addTwoColumnDoubleSheet(wb, "hours_by_day_all", asStringDoubleMap(employees.get("hoursByDay")));

            Map<String, Object> bookingVisits = analyticsService.getBookingTariffVisitAnalytics(from, to, restaurantId);
            addPivotLongAsTriple(wb, "booking_visits_plan", bookingVisits.get("visitsByDayAndTariffPlan"), "date", "tariff_plan", "visits");
            addPivotLongAsTriple(wb, "booking_visits_rule_type", bookingVisits.get("visitsByDayAndRuleType"), "date", "rule_type", "visits");
            addPivotLongAsTriple(wb, "booking_visits_rule", bookingVisits.get("visitsByDayAndRuleId"), "date", "rule", "visits");

            Map<String, Object> overview = analyticsService.getOverview(from, to, restaurantId);
            addScalarSheet(wb, "booking_pricing_overview", flattenScalars(overview));

            Map<String, Object> pricingImpact = analyticsService.getPricingRulesImpact(from, to, restaurantId);
            addPricingRulesSheet(wb, pricingImpact);

            Map<String, Object> stopChecks = analyticsService.getStopCheckAnalytics(from, to, restaurantId);
            addStopChecksSheet(wb, stopChecks);

            List<TopDishDto> top = analyticsService.getTopDishes(from, to, 500, restaurantId);
            addTopDishesSheet(wb, top);

            List<IngredientUsageDto> usage = analyticsService.getIngredientUsage(from, to, restaurantId);
            addIngredientUsageSheet(wb, usage);

            List<ProblemIngredientDto> problems = analyticsService.getProblemIngredients(restaurantId);
            addProblemIngredientsSheet(wb, problems);

            addStockMovementsSheet(wb, from, to, rid);
            addActivityLogSheet(wb, from, to);
            addShiftsSheet(wb, from, to, rid);
            addMenuDishesSheet(wb, rid);

            wb.write(out);
        }
    }

    private void addReadmeSheet(XSSFWorkbook wb, LocalDate from, LocalDate to, Long rid) {
        XSSFSheet sh = wb.createSheet(safeSheetName("_readme"));
        String[] lines = {
                "Сводный отчёт (все ключевые цифровые показатели из аналитики ресторана).",
                "Период: " + (from != null ? from : "—") + " — " + (to != null ? to : "—"),
                "RestaurantId: " + (rid != null ? rid : "контекст текущего пользователя"),
                "",
                "Заказы построчно и брони в полном составе — в ZIP-архиве (orders_line_items.csv, bookings.csv).",
                "Импорт в Google Таблицы: Файл → Импорт → Загрузка CSV, либо откройте XLSX через Google Drive."
        };
        for (int i = 0; i < lines.length; i++) {
            Row row = sh.createRow(i);
            row.createCell(0).setCellValue(lines[i]);
        }
    }

    private void addProductScalarSheet(XSSFWorkbook wb, Map<String, Object> products) {
        Map<String, String> m = new LinkedHashMap<>();
        for (String k : List.of("totalRevenue", "totalOrders", "totalItems", "avgCheck", "uniqueProducts")) {
            if (products.containsKey(k)) m.put(k, String.valueOf(products.get(k)));
        }
        addScalarSheet(wb, "product_kpi", m);
    }

    private void addScalarSheet(XSSFWorkbook wb, String name, Map<String, String> rows) {
        if (rows == null || rows.isEmpty()) return;
        XSSFSheet sh = wb.createSheet(safeSheetName(name));
        int r = 0;
        for (var e : new TreeMap<>(rows).entrySet()) {
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(e.getKey());
            row.createCell(1).setCellValue(e.getValue() != null ? e.getValue() : "");
        }
    }

    private Map<String, String> flattenScalars(Map<String, Object> overview) {
        Map<String, String> m = new TreeMap<>();
        if (overview == null) return m;
        for (var e : overview.entrySet()) {
            if (e.getValue() != null && !(e.getValue() instanceof Map)) {
                m.put(e.getKey(), String.valueOf(e.getValue()));
            }
        }
        return m;
    }

    private void addTwoColumnMoneySheet(XSSFWorkbook wb, String name, Map<String, BigDecimal> data) {
        if (data == null || data.isEmpty()) return;
        XSSFSheet sh = wb.createSheet(safeSheetName(name));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("key");
        h.createCell(1).setCellValue("amount");
        int r = 1;
        for (var e : new TreeMap<>(data).entrySet()) {
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(e.getKey());
            setMoneyCell(row.createCell(1), e.getValue());
        }
    }

    private void addTwoColumnLongSheet(XSSFWorkbook wb, String name, Map<String, Long> data) {
        if (data == null || data.isEmpty()) return;
        XSSFSheet sh = wb.createSheet(safeSheetName(name));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("key");
        h.createCell(1).setCellValue("count");
        int r = 1;
        for (var e : new TreeMap<>(data).entrySet()) {
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(e.getKey());
            row.createCell(1).setCellValue(e.getValue() != null ? e.getValue() : 0L);
        }
    }

    private void addTwoColumnDoubleSheet(XSSFWorkbook wb, String name, Map<String, Double> data) {
        if (data == null || data.isEmpty()) return;
        XSSFSheet sh = wb.createSheet(safeSheetName(name));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("key");
        h.createCell(1).setCellValue("value");
        int r = 1;
        for (var e : new TreeMap<>(data).entrySet()) {
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(e.getKey());
            row.createCell(1).setCellValue(e.getValue() != null ? e.getValue() : 0.0);
        }
    }

    private void addTripleNestedMoneySheets(XSSFWorkbook wb, Map<String, Object> products, String key,
                                            String c0, String c1, String c2) {
        Object raw = products.get(key);
        if (!(raw instanceof Map<?, ?> outer)) return;
        boolean any = false;
        for (Object v : outer.values()) {
            if (v instanceof Map<?, ?> m && !m.isEmpty()) {
                any = true;
                break;
            }
        }
        if (!any) return;
        XSSFSheet sh = wb.createSheet(safeSheetName(key));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue(c0);
        h.createCell(1).setCellValue(c1);
        h.createCell(2).setCellValue(c2);
        int r = 1;
        List<String> ok = new ArrayList<>();
        for (Object ko : outer.keySet()) ok.add(String.valueOf(ko));
        Collections.sort(ok);
        for (String outerKey : ok) {
            Object innerObj = outer.get(outerKey);
            if (!(innerObj instanceof Map<?, ?> inner)) continue;
            List<String> ik = new ArrayList<>();
            for (Object k : inner.keySet()) ik.add(String.valueOf(k));
            Collections.sort(ik);
            for (String innerKey : ik) {
                Row row = sh.createRow(r++);
                row.createCell(0).setCellValue(outerKey);
                row.createCell(1).setCellValue(innerKey);
                Object val = inner.get(innerKey);
                if (val instanceof BigDecimal bd) setMoneyCell(row.createCell(2), bd);
                else if (val instanceof Number n) row.createCell(2).setCellValue(n.doubleValue());
                else row.createCell(2).setCellValue(val != null ? val.toString() : "");
            }
        }
    }

    private void addPivotLongAsTriple(XSSFWorkbook wb, String sheetName, Object raw, String c0, String c1, String c2) {
        if (!(raw instanceof Map<?, ?> days)) return;
        XSSFSheet sh = wb.createSheet(safeSheetName(sheetName));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue(c0);
        h.createCell(1).setCellValue(c1);
        h.createCell(2).setCellValue(c2);
        int r = 1;
        List<String> dayKeys = days.keySet().stream().map(String::valueOf).sorted().toList();
        for (String day : dayKeys) {
            Object innerObj = days.get(day);
            if (!(innerObj instanceof Map<?, ?> inner)) continue;
            List<String> ks = inner.keySet().stream().map(String::valueOf).sorted().toList();
            for (String k : ks) {
                Object v = inner.get(k);
                long n = 0;
                if (v instanceof Number num) n = num.longValue();
                Row row = sh.createRow(r++);
                row.createCell(0).setCellValue(day);
                row.createCell(1).setCellValue(k);
                row.createCell(2).setCellValue(n);
            }
        }
    }

    private void addPricingRulesSheet(XSSFWorkbook wb, Map<String, Object> impact) {
        if (impact == null) return;
        Object rulesObj = impact.get("rules");
        if (!(rulesObj instanceof Map<?, ?> rules)) return;
        XSSFSheet sh = wb.createSheet(safeSheetName("pricing_rules_impact"));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("rule_id");
        h.createCell(1).setCellValue("rule_type");
        h.createCell(2).setCellValue("trigger_count");
        h.createCell(3).setCellValue("total_impact");
        int r = 1;
        List<Long> ids = new ArrayList<>();
        for (Object k : rules.keySet()) {
            try {
                ids.add(Long.parseLong(String.valueOf(k)));
            } catch (NumberFormatException ignored) {
            }
        }
        Collections.sort(ids);
        for (Long ruleId : ids) {
            Object rd = rules.get(ruleId);
            if (!(rd instanceof Map<?, ?> m)) continue;
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(ruleId);
            TariffRule tr = tariffRuleRepository.findById(ruleId).orElse(null);
            row.createCell(1).setCellValue(tr != null && tr.getRuleType() != null ? tr.getRuleType().name() : "");
            Object tc = m.get("triggerCount");
            row.createCell(2).setCellValue(tc instanceof Number ? ((Number) tc).longValue() : 0);
            Object ti = m.get("totalImpact");
            row.createCell(3).setCellValue(ti instanceof Number ? ((Number) ti).doubleValue() : 0.0);
        }
    }

    private void addStopChecksSheet(XSSFWorkbook wb, Map<String, Object> stopChecks) {
        if (stopChecks == null) return;
        XSSFSheet sh = wb.createSheet(safeSheetName("stop_checks"));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("metric");
        h.createCell(1).setCellValue("value");
        int r = 1;
        Row r0 = sh.createRow(r++);
        r0.createCell(0).setCellValue("triggerCount");
        Object tc = stopChecks.get("triggerCount");
        r0.createCell(1).setCellValue(tc != null ? tc.toString() : "");
        Object reasons = stopChecks.get("reasons");
        if (reasons instanceof Map<?, ?> m) {
            List<Map.Entry<?, ?>> entries = new ArrayList<>(m.entrySet());
            entries.sort(Comparator.comparing(e -> String.valueOf(e.getKey())));
            for (Map.Entry<?, ?> e : entries) {
                Row row = sh.createRow(r++);
                row.createCell(0).setCellValue("reason:" + e.getKey());
                row.createCell(1).setCellValue(String.valueOf(e.getValue()));
            }
        }
    }

    private void addTopDishesSheet(XSSFWorkbook wb, List<TopDishDto> list) {
        if (list == null || list.isEmpty()) return;
        XSSFSheet sh = wb.createSheet(safeSheetName("top_dishes"));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("dish_id");
        h.createCell(1).setCellValue("dish_name");
        h.createCell(2).setCellValue("total_sold");
        h.createCell(3).setCellValue("revenue");
        int r = 1;
        for (TopDishDto d : list) {
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(d.dishId() != null ? d.dishId() : 0);
            row.createCell(1).setCellValue(d.dishName() != null ? d.dishName() : "");
            row.createCell(2).setCellValue(d.totalSold());
            setMoneyCell(row.createCell(3), d.revenue());
        }
    }

    private void addIngredientUsageSheet(XSSFWorkbook wb, List<IngredientUsageDto> list) {
        if (list == null || list.isEmpty()) return;
        XSSFSheet sh = wb.createSheet(safeSheetName("ingredient_usage"));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("ingredient_id");
        h.createCell(1).setCellValue("name");
        h.createCell(2).setCellValue("total_used");
        h.createCell(3).setCellValue("unit");
        int r = 1;
        for (IngredientUsageDto d : list) {
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(d.ingredientId());
            row.createCell(1).setCellValue(d.ingredientName());
            row.createCell(2).setCellValue(d.totalUsed());
            row.createCell(3).setCellValue(d.unit() != null ? d.unit().name() : "");
        }
    }

    private void addProblemIngredientsSheet(XSSFWorkbook wb, List<ProblemIngredientDto> list) {
        if (list == null || list.isEmpty()) return;
        XSSFSheet sh = wb.createSheet(safeSheetName("problem_ingredients"));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("ingredient_id");
        h.createCell(1).setCellValue("name");
        h.createCell(2).setCellValue("stock");
        h.createCell(3).setCellValue("min");
        h.createCell(4).setCellValue("unit");
        h.createCell(5).setCellValue("reason");
        int r = 1;
        for (ProblemIngredientDto d : list) {
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(d.ingredientId());
            row.createCell(1).setCellValue(d.ingredientName());
            row.createCell(2).setCellValue(d.currentStock());
            row.createCell(3).setCellValue(d.minQty());
            row.createCell(4).setCellValue(d.unit() != null ? d.unit().name() : "");
            row.createCell(5).setCellValue(d.reason() != null ? d.reason() : "");
        }
    }

    private void addStockMovementsSheet(XSSFWorkbook wb, LocalDate from, LocalDate to, Long restaurantId) {
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDt = to != null ? to.atTime(23, 59, 59) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        List<StockMovementExportRow> moves = findStockMovementExportRows(restaurantId, fromDt, toDt);
        if (moves.isEmpty()) return;
        XSSFSheet sh = wb.createSheet(safeSheetName("stock_movements"));
        Row h = sh.createRow(0);
        String[] cols = {"id", "created_at", "ingredient_id", "ingredient", "type", "reason", "qty", "order_id", "created_by", "note"};
        for (int i = 0; i < cols.length; i++) h.createCell(i).setCellValue(cols[i]);
        int r = 1;
        for (StockMovementExportRow sm : moves) {
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(sm.id() != null ? sm.id() : 0);
            row.createCell(1).setCellValue(sm.createdAt() != null ? sm.createdAt().toString() : "");
            row.createCell(2).setCellValue(sm.ingredientId() != null ? sm.ingredientId() : 0);
            row.createCell(3).setCellValue(sm.ingredientName() != null ? sm.ingredientName() : "");
            row.createCell(4).setCellValue(sm.type() != null ? sm.type() : "");
            row.createCell(5).setCellValue(sm.reason() != null ? sm.reason() : "");
            row.createCell(6).setCellValue(sm.qty() != null ? sm.qty().doubleValue() : 0.0);
            row.createCell(7).setCellValue(sm.orderId() != null ? sm.orderId() : 0);
            row.createCell(8).setCellValue(sm.createdBy() != null ? sm.createdBy() : "");
            row.createCell(9).setCellValue(sm.note() != null ? sm.note() : "");
        }
    }

    private void addActivityLogSheet(XSSFWorkbook wb, LocalDate from, LocalDate to) {
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDt = to != null ? to.atTime(23, 59, 59) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        XSSFSheet sh = wb.createSheet(safeSheetName("activity_log"));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("id");
        h.createCell(1).setCellValue("created_at");
        h.createCell(2).setCellValue("action_type");
        h.createCell(3).setCellValue("entity_type");
        h.createCell(4).setCellValue("entity_id");
        h.createCell(5).setCellValue("user_name");
        h.createCell(6).setCellValue("description");
        h.createCell(7).setCellValue("old_values_json");
        h.createCell(8).setCellValue("new_values_json");
        int r = 1;
        int page = 0;
        while (page < MAX_ACTIVITY_PAGES) {
            Page<ActivityLog> p = activityLogRepository.findActivities(
                    null, null, null, null, fromDt, toDt, PageRequest.of(page, ACTIVITY_PAGE));
            for (ActivityLog a : p.getContent()) {
                Row row = sh.createRow(r++);
                row.createCell(0).setCellValue(a.getId() != null ? a.getId() : 0);
                row.createCell(1).setCellValue(a.getCreatedAt() != null ? a.getCreatedAt().toString() : "");
                row.createCell(2).setCellValue(a.getActionType() != null ? a.getActionType() : "");
                row.createCell(3).setCellValue(a.getEntityType() != null ? a.getEntityType() : "");
                row.createCell(4).setCellValue(a.getEntityId() != null ? a.getEntityId() : 0);
                row.createCell(5).setCellValue(a.getUserName() != null ? a.getUserName() : "");
                row.createCell(6).setCellValue(a.getDescription() != null ? a.getDescription() : "");
                try {
                    row.createCell(7).setCellValue(a.getOldValues() != null ? objectMapper.writeValueAsString(a.getOldValues()) : "");
                    row.createCell(8).setCellValue(a.getNewValues() != null ? objectMapper.writeValueAsString(a.getNewValues()) : "");
                } catch (Exception e) {
                    row.createCell(7).setCellValue("");
                    row.createCell(8).setCellValue("");
                }
            }
            if (!p.hasNext()) break;
            page++;
        }
    }

    private void addShiftsSheet(XSSFWorkbook wb, LocalDate from, LocalDate to, Long restaurantId) {
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime toDt = to != null ? to.atTime(23, 59, 59) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        List<ShiftDtos.ShiftDto> shifts = shiftService.getShifts(null, restaurantId, fromDt, toDt);
        if (shifts.isEmpty()) return;
        XSSFSheet sh = wb.createSheet(safeSheetName("shifts"));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("id");
        h.createCell(1).setCellValue("employee_id");
        h.createCell(2).setCellValue("employee");
        h.createCell(3).setCellValue("restaurant_id");
        h.createCell(4).setCellValue("start");
        h.createCell(5).setCellValue("end");
        h.createCell(6).setCellValue("status");
        h.createCell(7).setCellValue("shift_type");
        int r = 1;
        for (ShiftDtos.ShiftDto s : shifts) {
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(s.id());
            row.createCell(1).setCellValue(s.employeeId() != null ? s.employeeId() : 0);
            row.createCell(2).setCellValue(s.employeeName() != null ? s.employeeName() : "");
            row.createCell(3).setCellValue(s.restaurantId() != null ? s.restaurantId() : 0);
            row.createCell(4).setCellValue(s.startTime() != null ? s.startTime().toString() : "");
            row.createCell(5).setCellValue(s.endTime() != null ? s.endTime().toString() : "");
            row.createCell(6).setCellValue(s.status() != null ? s.status() : "");
            row.createCell(7).setCellValue(s.shiftType() != null ? s.shiftType() : "");
        }
    }

    private void addMenuDishesSheet(XSSFWorkbook wb, Long restaurantId) {
        if (restaurantId == null) return;
        Page<Dish> page = dishRepository.searchDishes(restaurantId, null, null, PageRequest.of(0, 15_000));
        List<Dish> dishes = page.getContent();
        if (dishes.isEmpty()) return;
        XSSFSheet sh = wb.createSheet(safeSheetName("menu_dishes"));
        Row h = sh.createRow(0);
        h.createCell(0).setCellValue("id");
        h.createCell(1).setCellValue("name");
        h.createCell(2).setCellValue("category");
        h.createCell(3).setCellValue("price");
        h.createCell(4).setCellValue("active");
        int r = 1;
        for (Dish d : dishes) {
            Row row = sh.createRow(r++);
            row.createCell(0).setCellValue(d.getId() != null ? d.getId() : 0);
            row.createCell(1).setCellValue(d.getName() != null ? d.getName() : "");
            row.createCell(2).setCellValue(d.getCategory() != null ? d.getCategory().getName() : "");
            setMoneyCell(row.createCell(3), d.getPrice());
            row.createCell(4).setCellValue(Boolean.TRUE.equals(d.getIsActive()));
        }
    }

    private static String safeSheetName(String raw) {
        String t = raw.replaceAll("[\\\\/*?\\[\\]:]", "_");
        if (t.length() > 31) t = t.substring(0, 31);
        if (t.isBlank()) t = "sheet";
        if (t.startsWith("_")) t = "X" + t.substring(1);
        return t;
    }

    private static void setMoneyCell(Cell cell, BigDecimal v) {
        if (v == null) cell.setCellValue(0);
        else cell.setCellValue(v.doubleValue());
    }

    private Map<String, BigDecimal> asStringBigDecimalMap(Object o) {
        if (!(o instanceof Map<?, ?> m)) return Map.of();
        Map<String, BigDecimal> out = new TreeMap<>();
        for (var e : m.entrySet()) {
            String k = String.valueOf(e.getKey());
            Object v = e.getValue();
            if (v instanceof BigDecimal bd) out.put(k, bd);
            else if (v instanceof Number n) out.put(k, BigDecimal.valueOf(n.doubleValue()));
            else if (v != null) {
                try {
                    out.put(k, new BigDecimal(v.toString()));
                } catch (Exception ignored) {
                }
            }
        }
        return out;
    }

    private Map<String, Long> asStringLongMap(Object o) {
        if (!(o instanceof Map<?, ?> m)) return Map.of();
        Map<String, Long> out = new TreeMap<>();
        for (var e : m.entrySet()) {
            Object v = e.getValue();
            long n = 0;
            if (v instanceof Number num) n = num.longValue();
            out.put(String.valueOf(e.getKey()), n);
        }
        return out;
    }

    private Map<String, Double> asStringDoubleMap(Object o) {
        if (!(o instanceof Map<?, ?> m)) return Map.of();
        Map<String, Double> out = new TreeMap<>();
        for (var e : m.entrySet()) {
            Object v = e.getValue();
            double d = 0;
            if (v instanceof Number num) d = num.doubleValue();
            out.put(String.valueOf(e.getKey()), d);
        }
        return out;
    }

    @Transactional(readOnly = true)
    public byte[] exportStockMovementsCsv(LocalDate from, LocalDate to) {
        Long restaurantId = SecurityUtils.isHeadAdmin() ? null : SecurityUtils.getCurrentRestaurantId();
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDt = to != null ? to.atTime(23, 59, 59) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        List<StockMovementExportRow> moves = findStockMovementExportRows(restaurantId, fromDt, toDt);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        java.io.OutputStreamWriter w = new java.io.OutputStreamWriter(out, StandardCharsets.UTF_8);
        try {
            w.write("\uFEFF");
            w.write("id,created_at,ingredient_id,ingredient_name,type,reason,qty,order_id,created_by,note\n");
            for (StockMovementExportRow sm : moves) {
                w.write(String.valueOf(sm.id() != null ? sm.id() : ""));
                w.write(",");
                w.write(escapeCsv(sm.createdAt() != null ? sm.createdAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) : ""));
                w.write(",");
                w.write(String.valueOf(sm.ingredientId() != null ? sm.ingredientId() : ""));
                w.write(",");
                w.write(escapeCsv(sm.ingredientName()));
                w.write(",");
                w.write(sm.type() != null ? sm.type() : "");
                w.write(",");
                w.write(sm.reason() != null ? sm.reason() : "");
                w.write(",");
                w.write(sm.qty() != null ? sm.qty().toPlainString() : "");
                w.write(",");
                w.write(sm.orderId() != null ? String.valueOf(sm.orderId()) : "");
                w.write(",");
                w.write(escapeCsv(sm.createdBy()));
                w.write(",");
                w.write(escapeCsv(sm.note()));
                w.write("\n");
            }
            w.flush();
        } catch (IOException e) {
            throw new BusinessException("stock export failed: " + e.getMessage());
        }
        return out.toByteArray();
    }

    private record StockMovementExportRow(
            Long id,
            LocalDateTime createdAt,
            Long ingredientId,
            String ingredientName,
            String type,
            String reason,
            BigDecimal qty,
            Long orderId,
            String createdBy,
            String note
    ) {}

    private List<StockMovementExportRow> findStockMovementExportRows(
            Long restaurantId,
            LocalDateTime fromDt,
            LocalDateTime toDt
    ) {
        String sql = """
                SELECT
                    sm.id,
                    COALESCE(o.paid_at, o.closed_at, o.created_at, sm.created_at) AS effective_created_at,
                    i.id AS ingredient_id,
                    i.name AS ingredient_name,
                    sm.type,
                    sm.reason,
                    sm.qty,
                    sm.order_id,
                    sm.created_by,
                    sm.note
                FROM stock_movements sm
                JOIN ingredients i ON i.id = sm.ingredient_id
                LEFT JOIN orders o ON o.id = sm.order_id
                WHERE (CAST(:restaurantId AS bigint) IS NULL OR i.restaurant_id = CAST(:restaurantId AS bigint))
                  AND COALESCE(o.paid_at, o.closed_at, o.created_at, sm.created_at) >= CAST(:fromDt AS timestamp)
                  AND COALESCE(o.paid_at, o.closed_at, o.created_at, sm.created_at) <= CAST(:toDt AS timestamp)
                ORDER BY effective_created_at ASC, sm.id ASC
                """;

        @SuppressWarnings("unchecked")
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("restaurantId", restaurantId)
                .setParameter("fromDt", fromDt)
                .setParameter("toDt", toDt)
                .getResultList();

        return rows.stream()
                .map(row -> new StockMovementExportRow(
                        asLong(row[0]),
                        asLocalDateTime(row[1]),
                        asLong(row[2]),
                        asString(row[3]),
                        asString(row[4]),
                        asString(row[5]),
                        asBigDecimal(row[6]),
                        asLong(row[7]),
                        asString(row[8]),
                        asString(row[9])
                ))
                .toList();
    }

    private Long asLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.longValue();
        return Long.valueOf(value.toString());
    }

    private LocalDateTime asLocalDateTime(Object value) {
        if (value == null) return null;
        if (value instanceof LocalDateTime localDateTime) return localDateTime;
        if (value instanceof Timestamp timestamp) return timestamp.toLocalDateTime();
        return LocalDateTime.parse(value.toString().replace(" ", "T"));
    }

    private String asString(Object value) {
        return value != null ? value.toString() : null;
    }

    private BigDecimal asBigDecimal(Object value) {
        if (value == null) return null;
        if (value instanceof BigDecimal bigDecimal) return bigDecimal;
        if (value instanceof Number number) return BigDecimal.valueOf(number.doubleValue());
        return new BigDecimal(value.toString());
    }

    public byte[] exportActivityLogCsv(LocalDate from, LocalDate to) {
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDt = to != null ? to.atTime(23, 59, 59) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        java.io.OutputStreamWriter w = new java.io.OutputStreamWriter(out, StandardCharsets.UTF_8);
        try {
            w.write("\uFEFF");
            w.write("id,created_at,action_type,entity_type,entity_id,user_name,description,old_values_json,new_values_json\n");
            int page = 0;
            while (page < MAX_ACTIVITY_PAGES) {
                Page<ActivityLog> p = activityLogRepository.findActivities(
                        null, null, null, null, fromDt, toDt, PageRequest.of(page, ACTIVITY_PAGE));
                for (ActivityLog a : p.getContent()) {
                    w.write(String.valueOf(a.getId()));
                    w.write(",");
                    w.write(escapeCsv(a.getCreatedAt() != null ? a.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) : ""));
                    w.write(",");
                    w.write(escapeCsv(a.getActionType()));
                    w.write(",");
                    w.write(escapeCsv(a.getEntityType()));
                    w.write(",");
                    w.write(a.getEntityId() != null ? String.valueOf(a.getEntityId()) : "");
                    w.write(",");
                    w.write(escapeCsv(a.getUserName()));
                    w.write(",");
                    w.write(escapeCsv(a.getDescription()));
                    w.write(",");
                    w.write(escapeCsv(jsonOrEmpty(a.getOldValues())));
                    w.write(",");
                    w.write(escapeCsv(jsonOrEmpty(a.getNewValues())));
                    w.write("\n");
                }
                if (!p.hasNext()) break;
                page++;
            }
            w.flush();
        } catch (IOException e) {
            throw new BusinessException("activity export failed: " + e.getMessage());
        }
        return out.toByteArray();
    }

    private String jsonOrEmpty(Object m) {
        if (m == null) return "";
        try {
            return objectMapper.writeValueAsString(m);
        } catch (Exception e) {
            return String.valueOf(m);
        }
    }

    public byte[] exportShiftsCsv(LocalDate from, LocalDate to, Long restaurantId) {
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime toDt = to != null ? to.atTime(23, 59, 59) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        List<ShiftDtos.ShiftDto> shifts = shiftService.getShifts(null, restaurantId, fromDt, toDt);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        java.io.OutputStreamWriter w = new java.io.OutputStreamWriter(out, StandardCharsets.UTF_8);
        try {
            w.write("\uFEFF");
            w.write("id,employee_id,employee_name,restaurant_id,start_time,end_time,status,shift_type\n");
            for (ShiftDtos.ShiftDto s : shifts) {
                w.write(String.valueOf(s.id()));
                w.write(",");
                w.write(s.employeeId() != null ? String.valueOf(s.employeeId()) : "");
                w.write(",");
                w.write(escapeCsv(s.employeeName()));
                w.write(",");
                w.write(s.restaurantId() != null ? String.valueOf(s.restaurantId()) : "");
                w.write(",");
                w.write(escapeCsv(s.startTime() != null ? s.startTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) : ""));
                w.write(",");
                w.write(escapeCsv(s.endTime() != null ? s.endTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) : ""));
                w.write(",");
                w.write(s.status() != null ? s.status() : "");
                w.write(",");
                w.write(s.shiftType() != null ? s.shiftType() : "");
                w.write("\n");
            }
            w.flush();
        } catch (IOException e) {
            throw new BusinessException("shifts export failed: " + e.getMessage());
        }
        return out.toByteArray();
    }

    private static String escapeCsv(String s) {
        if (s == null) return "";
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }
}
