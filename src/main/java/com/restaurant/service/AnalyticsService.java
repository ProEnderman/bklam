package com.restaurant.service;

import com.restaurant.dto.IngredientUsageDto;
import com.restaurant.dto.ProblemIngredientDto;
import com.restaurant.dto.TopDishDto;
import com.restaurant.model.*;
import com.restaurant.repository.*;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.IsoFields;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final IngredientRepository ingredientRepository;
    private final StockMovementRepository stockMovementRepository;
    private final PricingRunRepository pricingRunRepository;
    private final BookingRepository bookingRepository;
    private final ShiftRepository shiftRepository;
    private final TariffRuleRepository tariffRuleRepository;
    private final DishCategoryRepository dishCategoryRepository;
    private final DishRepository dishRepository;
    private final UserRepository userRepository;
    
    @Transactional(readOnly = true)
    public Map<String, Object> getOverview(LocalDate from, LocalDate to, Long restaurantId) {
        Long currentRestaurantId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        
        LocalDateTime fromDateTime = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDateTime = to != null ? to.atTime(23, 59, 59, 999_999_999) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        
        // Собираем ID pricing_run-ов, связанных с оплаченными бронированиями
        java.util.Set<Long> paidPricingRunIds = bookingRepository.findAll().stream()
            .filter(b -> b.getStatus() == com.restaurant.model.Booking.BookingStatus.PAID)
            .filter(b -> (currentRestaurantId == null ||
                (b.getBranch() != null && b.getBranch().getId().equals(currentRestaurantId))))
            .filter(b -> {
                LocalDateTime paidAt = b.getPaidAt() != null ? b.getPaidAt() : b.getCreatedAt();
                return !paidAt.isBefore(fromDateTime) && !paidAt.isAfter(toDateTime);
            })
            .filter(b -> b.getPricingRun() != null)
            .map(b -> b.getPricingRun().getId())
            .collect(Collectors.toSet());
        
        // Получаем статистику по pricing runs только для оплаченных бронирований
        List<com.restaurant.model.PricingRun> runs = pricingRunRepository.findAll().stream()
            .filter(run -> paidPricingRunIds.contains(run.getId()))
            .collect(Collectors.toList());
        
        long totalRuns = runs.size();
        long successfulRuns = runs.stream().filter(r -> r.getStatus() == com.restaurant.model.PricingRun.PricingStatus.OK).count();
        long stoppedRuns = runs.stream().filter(r -> r.getStatus() == com.restaurant.model.PricingRun.PricingStatus.STOP).count();
        
        double totalAmount = runs.stream()
            .mapToDouble(r -> r.getTotalAmount() != null ? r.getTotalAmount().doubleValue() : 0.0)
            .sum();
        double averageAmount = totalRuns > 0 ? totalAmount / totalRuns : 0.0;
        
        Map<String, Object> overview = new HashMap<>();
        overview.put("totalRuns", totalRuns);
        overview.put("successfulRuns", successfulRuns);
        overview.put("stoppedRuns", stoppedRuns);
        overview.put("totalAmount", totalAmount);
        overview.put("averageAmount", averageAmount);
        return overview;
    }
    
    @Transactional(readOnly = true)
    public Map<String, Object> getRevenue(LocalDate from, LocalDate to, Long restaurantId) {
        Long currentRestaurantId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        
        LocalDateTime fromDateTime = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDateTime = to != null ? to.atTime(23, 59, 59, 999_999_999) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        
        BigDecimal totalRevenue = orderRepository.getTotalRevenue(currentRestaurantId, fromDateTime, toDateTime);
        if (totalRevenue == null) totalRevenue = BigDecimal.ZERO;
        
        // Группировка по дням
        Map<String, BigDecimal> byDay = new HashMap<>();
        List<com.restaurant.model.Order> orders = orderRepository.findAll().stream()
            .filter(o -> (currentRestaurantId == null || o.getRestaurantId().equals(currentRestaurantId)))
            .filter(o -> o.getStatus().toString().equals("CLOSED"))
            .filter(o -> o.getPaidAt() != null)
            .filter(o -> {
                LocalDateTime createdAt = o.getCreatedAt();
                return !createdAt.isBefore(fromDateTime) && !createdAt.isAfter(toDateTime);
            })
            .collect(Collectors.toList());
        
        for (com.restaurant.model.Order order : orders) {
            String dayKey = order.getCreatedAt().toLocalDate().toString();
            byDay.merge(dayKey, order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
        }
        
        // By week
        Map<String, BigDecimal> byWeek = new TreeMap<>();
        for (com.restaurant.model.Order order : orders) {
            LocalDate d = order.getCreatedAt().toLocalDate();
            int week = d.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
            int year = d.get(IsoFields.WEEK_BASED_YEAR);
            String key = String.format("%d-W%02d", year, week);
            byWeek.merge(key, order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
        }

        // By month
        Map<String, BigDecimal> byMonth = new TreeMap<>();
        for (com.restaurant.model.Order order : orders) {
            String month = order.getCreatedAt().toLocalDate().withDayOfMonth(1).toString();
            byMonth.merge(month, order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
        }

        Map<String, BigDecimal> byYear = new TreeMap<>();
        for (com.restaurant.model.Order order : orders) {
            String yearKey = String.valueOf(order.getCreatedAt().getYear());
            byYear.merge(yearKey, order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
        }

        Map<String, Object> revenue = new HashMap<>();
        revenue.put("total", totalRevenue);
        revenue.put("byDay", byDay);
        revenue.put("byWeek", byWeek);
        revenue.put("byMonth", byMonth);
        revenue.put("byYear", byYear);
        revenue.put("period", from != null && to != null ? 
            String.format("%s to %s", from.toString(), to.toString()) : "All time");
        return revenue;
    }
    
    @Transactional(readOnly = true)
    public Map<String, Object> getEmployeeAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        Long rid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDt = to != null ? to.atTime(23, 59, 59) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);

        Map<String, Object> analytics = new LinkedHashMap<>();

        // 1. Shift hours per employee
        List<Shift> shifts = shiftRepository.findAll().stream()
                .filter(s -> rid == null || s.getRestaurant().getId().equals(rid))
                .filter(s -> !s.getStartTime().isBefore(fromDt) && !s.getStartTime().isAfter(toDt))
                .collect(Collectors.toList());

        // Build employee name map
        Map<Long, String> empNames = new LinkedHashMap<>();
        for (Shift s : shifts) {
            if (s.getEmployee() != null) {
                User emp = s.getEmployee();
                String name = (emp.getFirstName() != null ? emp.getFirstName() : "") +
                        " " + (emp.getLastName() != null ? emp.getLastName() : "");
                name = name.trim();
                if (name.isEmpty()) name = emp.getUsername();
                empNames.putIfAbsent(emp.getId(), name);
            }
        }

        // Hours by employee
        Map<String, Double> hoursByEmployee = new LinkedHashMap<>();
        Map<Long, Double> empHoursById = new LinkedHashMap<>();
        for (Shift s : shifts) {
            if (s.getEmployee() == null) continue;
            double hours = ChronoUnit.MINUTES.between(s.getStartTime(), s.getEndTime()) / 60.0;
            String name = empNames.getOrDefault(s.getEmployee().getId(), "Unknown");
            hoursByEmployee.merge(name, Math.round(hours * 100.0) / 100.0, Double::sum);
            empHoursById.merge(s.getEmployee().getId(), hours, Double::sum);
        }
        analytics.put("hoursByEmployee", hoursByEmployee);

        // Shift count by employee
        Map<String, Long> shiftCountByEmployee = shifts.stream()
                .filter(s -> s.getEmployee() != null)
                .collect(Collectors.groupingBy(
                        s -> empNames.getOrDefault(s.getEmployee().getId(), "Unknown"),
                        LinkedHashMap::new, Collectors.counting()));
        analytics.put("shiftCountByEmployee", shiftCountByEmployee);

        // Hours by day
        Map<String, Double> hoursByDay = new TreeMap<>();
        for (Shift s : shifts) {
            double hours = ChronoUnit.MINUTES.between(s.getStartTime(), s.getEndTime()) / 60.0;
            String day = s.getStartTime().toLocalDate().toString();
            hoursByDay.merge(day, Math.round(hours * 100.0) / 100.0, Double::sum);
        }
        analytics.put("hoursByDay", hoursByDay);

        // Часы только у администраторов (роли ADMIN и HEAD_ADMIN)
        Map<String, Double> hoursByAdministrator = new LinkedHashMap<>();
        double totalAdministratorHours = 0;
        for (Shift s : shifts) {
            if (s.getEmployee() == null) continue;
            Role role = s.getEmployee().getRole();
            if (role != Role.ADMIN && role != Role.HEAD_ADMIN) continue;
            double hours = ChronoUnit.MINUTES.between(s.getStartTime(), s.getEndTime()) / 60.0;
            hours = Math.round(hours * 100.0) / 100.0;
            String name = empNames.getOrDefault(s.getEmployee().getId(), "Unknown");
            hoursByAdministrator.merge(name, hours, Double::sum);
            totalAdministratorHours += hours;
        }
        analytics.put("hoursByAdministrator", hoursByAdministrator);
        analytics.put("totalAdministratorHours", Math.round(totalAdministratorHours * 100.0) / 100.0);
        analytics.put("administratorShiftCount", shifts.stream()
                .filter(s -> s.getEmployee() != null)
                .filter(s -> {
                    Role r = s.getEmployee().getRole();
                    return r == Role.ADMIN || r == Role.HEAD_ADMIN;
                })
                .count());

        // 2. Orders (revenue) per employee (createdBy) — only paid orders
        List<Order> closedOrders = orderRepository.findAll().stream()
                .filter(o -> rid == null || (o.getRestaurantId() != null && o.getRestaurantId().equals(rid)))
                .filter(o -> o.getStatus() == OrderStatus.CLOSED)
                .filter(o -> o.getPaidAt() != null)
                .filter(o -> !o.getCreatedAt().isBefore(fromDt) && !o.getCreatedAt().isAfter(toDt))
                .collect(Collectors.toList());

        Map<String, BigDecimal> revenueByEmployee = new LinkedHashMap<>();
        Map<String, Long> orderCountByEmployee = new LinkedHashMap<>();
        for (Order o : closedOrders) {
            String emp = o.getCreatedBy() != null ? o.getCreatedBy() : "system";
            revenueByEmployee.merge(emp, o.getTotalAmount() != null ? o.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
            orderCountByEmployee.merge(emp, 1L, Long::sum);
        }
        analytics.put("revenueByEmployee", revenueByEmployee);
        analytics.put("orderCountByEmployee", orderCountByEmployee);

        // 3. Revenue per hour (for employees with shift data)
        Map<String, Double> revenuePerHour = new LinkedHashMap<>();
        for (var entry : revenueByEmployee.entrySet()) {
            // Try to match by username
            Double empHours = null;
            for (var e2 : empNames.entrySet()) {
                if (e2.getValue().equals(entry.getKey()) || entry.getKey().contains(e2.getValue())) {
                    empHours = empHoursById.get(e2.getKey());
                    break;
                }
            }
            if (empHours != null && empHours > 0) {
                revenuePerHour.put(entry.getKey(), Math.round(entry.getValue().doubleValue() / empHours * 100.0) / 100.0);
            }
        }
        analytics.put("revenuePerHour", revenuePerHour);

        // Summary stats
        analytics.put("totalShifts", shifts.size());
        analytics.put("totalEmployees", empNames.size());
        double totalHours = hoursByEmployee.values().stream().mapToDouble(Double::doubleValue).sum();
        analytics.put("totalHours", Math.round(totalHours * 100.0) / 100.0);
        analytics.put("avgHoursPerShift", shifts.isEmpty() ? 0 : Math.round(totalHours / shifts.size() * 100.0) / 100.0);

        return analytics;
    }

    // ═══════════════ PRODUCT SALES ANALYTICS ═══════════════

    @Transactional(readOnly = true)
    public Map<String, Object> getProductSalesAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        Long rid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDt = to != null ? to.atTime(23, 59, 59) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);

        Map<String, Object> result = new LinkedHashMap<>();

        // Load closed + paid orders with items
        List<Order> closedOrders = orderRepository.findAll().stream()
                .filter(o -> rid == null || (o.getRestaurantId() != null && o.getRestaurantId().equals(rid)))
                .filter(o -> o.getStatus() == OrderStatus.CLOSED)
                .filter(o -> o.getPaidAt() != null)
                .filter(o -> !o.getCreatedAt().isBefore(fromDt) && !o.getCreatedAt().isAfter(toDt))
                .collect(Collectors.toList());

        // Collect all order items
        List<OrderItem> allItems = new ArrayList<>();
        for (Order order : closedOrders) {
            if (order.getItems() != null) {
                allItems.addAll(order.getItems());
            }
        }

        // Build dish → category map
        Map<Long, String> dishCategoryMap = new HashMap<>();
        Map<Long, String> dishNameMap = new HashMap<>();
        for (OrderItem item : allItems) {
            if (item.getDish() != null) {
                Dish dish = item.getDish();
                dishNameMap.putIfAbsent(dish.getId(), dish.getName());
                if (dish.getCategory() != null) {
                    dishCategoryMap.putIfAbsent(dish.getId(), dish.getCategory().getName());
                } else {
                    dishCategoryMap.putIfAbsent(dish.getId(), "Без категории");
                }
            }
        }

        // 1. Sales by category
        Map<String, BigDecimal> revenueByCategory = new LinkedHashMap<>();
        Map<String, Long> qtyByCategory = new LinkedHashMap<>();
        for (OrderItem item : allItems) {
            if (item.getDish() == null) continue;
            String cat = dishCategoryMap.getOrDefault(item.getDish().getId(), "Без категории");
            revenueByCategory.merge(cat, item.getLineTotal() != null ? item.getLineTotal() : BigDecimal.ZERO, BigDecimal::add);
            qtyByCategory.merge(cat, (long) (item.getQty() != null ? item.getQty() : 0), Long::sum);
        }
        result.put("revenueByCategory", revenueByCategory);
        result.put("qtyByCategory", qtyByCategory);

        // 2. Sales by product (all products, sorted by revenue)
        Map<String, BigDecimal> revenueByProduct = new LinkedHashMap<>();
        Map<String, Long> qtyByProduct = new LinkedHashMap<>();
        for (OrderItem item : allItems) {
            if (item.getDish() == null) continue;
            String name = item.getDish().getName();
            revenueByProduct.merge(name, item.getLineTotal() != null ? item.getLineTotal() : BigDecimal.ZERO, BigDecimal::add);
            qtyByProduct.merge(name, (long) (item.getQty() != null ? item.getQty() : 0), Long::sum);
        }
        // Sort by revenue desc
        result.put("revenueByProduct", sortByValueDesc(revenueByProduct));
        result.put("qtyByProduct", sortByValueDescLong(qtyByProduct));

        // 3. Sales by employee (createdBy)
        Map<String, BigDecimal> revenueByAdmin = new LinkedHashMap<>();
        Map<String, Long> ordersByAdmin = new LinkedHashMap<>();
        Map<String, Long> itemsByAdmin = new LinkedHashMap<>();
        for (Order order : closedOrders) {
            String admin = order.getCreatedBy() != null ? order.getCreatedBy() : "system";
            BigDecimal orderTotal = order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO;
            revenueByAdmin.merge(admin, orderTotal, BigDecimal::add);
            ordersByAdmin.merge(admin, 1L, Long::sum);
            if (order.getItems() != null) {
                long itemCount = order.getItems().stream()
                        .mapToLong(i -> i.getQty() != null ? i.getQty() : 0).sum();
                itemsByAdmin.merge(admin, itemCount, Long::sum);
            }
        }
        result.put("revenueByAdmin", revenueByAdmin);
        result.put("ordersByAdmin", ordersByAdmin);
        result.put("itemsByAdmin", itemsByAdmin);

        // 4. Revenue by day
        Map<String, BigDecimal> revenueByDay = new TreeMap<>();
        Map<String, Long> ordersByDay = new TreeMap<>();
        for (Order order : closedOrders) {
            String day = order.getCreatedAt().toLocalDate().toString();
            revenueByDay.merge(day, order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
            ordersByDay.merge(day, 1L, Long::sum);
        }
        result.put("revenueByDay", revenueByDay);
        result.put("ordersByDay", ordersByDay);

        // 5. Revenue by week
        Map<String, BigDecimal> revenueByWeek = new TreeMap<>();
        for (Order order : closedOrders) {
            LocalDate d = order.getCreatedAt().toLocalDate();
            int week = d.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
            int year = d.get(IsoFields.WEEK_BASED_YEAR);
            String key = String.format("%d-W%02d", year, week);
            revenueByWeek.merge(key, order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
        }
        result.put("revenueByWeek", revenueByWeek);

        // 6. Revenue by month
        Map<String, BigDecimal> revenueByMonth = new TreeMap<>();
        for (Order order : closedOrders) {
            String month = order.getCreatedAt().toLocalDate().withDayOfMonth(1).toString();
            revenueByMonth.merge(month, order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
        }
        result.put("revenueByMonth", revenueByMonth);

        // 6b. Revenue and orders by calendar year
        Map<String, BigDecimal> revenueByYear = new TreeMap<>();
        Map<String, Long> ordersByYear = new TreeMap<>();
        for (Order order : closedOrders) {
            String yearKey = String.valueOf(order.getCreatedAt().getYear());
            revenueByYear.merge(yearKey, order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
            ordersByYear.merge(yearKey, 1L, Long::sum);
        }
        result.put("revenueByYear", revenueByYear);
        result.put("ordersByYear", ordersByYear);

        // Многомерные срезы продаж (позиции заказов)
        Map<String, Map<String, BigDecimal>> revenueByAdminAndDay = new TreeMap<>();
        Map<String, Map<String, BigDecimal>> revenueByAdminAndCategory = new TreeMap<>();
        Map<String, Map<String, BigDecimal>> revenueByAdminAndProduct = new TreeMap<>();
        Map<String, Map<String, BigDecimal>> revenueByDateAndCategory = new TreeMap<>();
        Map<String, Map<String, BigDecimal>> revenueByDateAndProduct = new TreeMap<>();
        Map<String, Map<String, Long>> qtyByAdminAndCategory = new TreeMap<>();
        Map<String, Map<String, Long>> qtyByAdminAndProduct = new TreeMap<>();
        Map<String, Map<String, Long>> qtyByDateAndCategory = new TreeMap<>();
        Map<String, Map<String, Long>> qtyByDateAndProduct = new TreeMap<>();

        for (Order order : closedOrders) {
            String admin = order.getCreatedBy() != null ? order.getCreatedBy() : "system";
            String day = order.getCreatedAt().toLocalDate().toString();
            BigDecimal orderTotal = order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO;
            revenueByAdminAndDay.computeIfAbsent(admin, k -> new TreeMap<>()).merge(day, orderTotal, BigDecimal::add);

            if (order.getItems() == null) continue;
            for (OrderItem item : order.getItems()) {
                if (item.getDish() == null) continue;
                String cat = dishCategoryMap.getOrDefault(item.getDish().getId(), "Без категории");
                String prod = item.getDish().getName();
                BigDecimal line = item.getLineTotal() != null ? item.getLineTotal() : BigDecimal.ZERO;
                long q = item.getQty() != null ? item.getQty() : 0;

                revenueByAdminAndCategory.computeIfAbsent(admin, k -> new TreeMap<>()).merge(cat, line, BigDecimal::add);
                revenueByAdminAndProduct.computeIfAbsent(admin, k -> new TreeMap<>()).merge(prod, line, BigDecimal::add);
                revenueByDateAndCategory.computeIfAbsent(day, k -> new TreeMap<>()).merge(cat, line, BigDecimal::add);
                revenueByDateAndProduct.computeIfAbsent(day, k -> new TreeMap<>()).merge(prod, line, BigDecimal::add);
                qtyByAdminAndCategory.computeIfAbsent(admin, k -> new TreeMap<>()).merge(cat, q, Long::sum);
                qtyByAdminAndProduct.computeIfAbsent(admin, k -> new TreeMap<>()).merge(prod, q, Long::sum);
                qtyByDateAndCategory.computeIfAbsent(day, k -> new TreeMap<>()).merge(cat, q, Long::sum);
                qtyByDateAndProduct.computeIfAbsent(day, k -> new TreeMap<>()).merge(prod, q, Long::sum);
            }
        }
        result.put("revenueByAdminAndDay", revenueByAdminAndDay);
        result.put("revenueByAdminAndCategory", revenueByAdminAndCategory);
        result.put("revenueByAdminAndProduct", revenueByAdminAndProduct);
        result.put("revenueByDateAndCategory", revenueByDateAndCategory);
        result.put("revenueByDateAndProduct", revenueByDateAndProduct);
        result.put("qtyByAdminAndCategory", qtyByAdminAndCategory);
        result.put("qtyByAdminAndProduct", qtyByAdminAndProduct);
        result.put("qtyByDateAndCategory", qtyByDateAndCategory);
        result.put("qtyByDateAndProduct", qtyByDateAndProduct);

        // 7. Revenue by day of week
        Map<String, BigDecimal> revenueByDow = new LinkedHashMap<>();
        Map<String, Long> ordersByDow = new LinkedHashMap<>();
        for (DayOfWeek dow : DayOfWeek.values()) {
            revenueByDow.put(dow.name(), BigDecimal.ZERO);
            ordersByDow.put(dow.name(), 0L);
        }
        for (Order order : closedOrders) {
            String dow = order.getCreatedAt().getDayOfWeek().name();
            revenueByDow.merge(dow, order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
            ordersByDow.merge(dow, 1L, Long::sum);
        }
        result.put("revenueByDow", revenueByDow);
        result.put("ordersByDow", ordersByDow);

        // 8. Revenue by hour
        Map<String, BigDecimal> revenueByHour = new TreeMap<>();
        for (int h = 0; h < 24; h++) revenueByHour.put(String.valueOf(h), BigDecimal.ZERO);
        for (Order order : closedOrders) {
            String hour = String.valueOf(order.getCreatedAt().getHour());
            revenueByHour.merge(hour, order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO, BigDecimal::add);
        }
        result.put("revenueByHour", revenueByHour);

        // Summary
        BigDecimal totalRevenue = closedOrders.stream()
                .map(o -> o.getTotalAmount() != null ? o.getTotalAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long totalItems = allItems.stream().mapToLong(i -> i.getQty() != null ? i.getQty() : 0).sum();
        result.put("totalRevenue", totalRevenue.setScale(2, RoundingMode.HALF_UP));
        result.put("totalOrders", closedOrders.size());
        result.put("totalItems", totalItems);
        result.put("avgCheck", closedOrders.isEmpty() ? BigDecimal.ZERO : totalRevenue.divide(BigDecimal.valueOf(closedOrders.size()), 2, RoundingMode.HALF_UP));
        result.put("uniqueProducts", dishNameMap.size());

        return result;
    }

    private <K> Map<K, BigDecimal> sortByValueDesc(Map<K, BigDecimal> map) {
        return map.entrySet().stream()
                .sorted(Map.Entry.<K, BigDecimal>comparingByValue().reversed())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a, LinkedHashMap::new));
    }

    private <K> Map<K, Long> sortByValueDescLong(Map<K, Long> map) {
        return map.entrySet().stream()
                .sorted(Map.Entry.<K, Long>comparingByValue().reversed())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a, LinkedHashMap::new));
    }

    /**
     * Оплаченные бронирования: посещения по тарифному плану и по типам применённых правил (SPECIAL, HOLIDAY, …) в разрезе календарного дня.
     * Количество «людей» в модели брони не хранится — считается одно посещение на оплаченное бронирование.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getBookingTariffVisitAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        Long rid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDt = to != null ? to.atTime(23, 59, 59, 999_999_999) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);

        List<Booking> bookings = bookingRepository.findAll().stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .filter(b -> rid == null || (b.getBranch() != null && b.getBranch().getId().equals(rid)))
                .filter(b -> {
                    LocalDateTime t = b.getPaidAt() != null ? b.getPaidAt() : b.getStartAt();
                    return !t.isBefore(fromDt) && !t.isAfter(toDt);
                })
                .collect(Collectors.toList());

        Map<Long, TariffRule> ruleById = tariffRuleRepository.findAll().stream()
                .filter(r -> r.getTariffPlan() != null && r.getTariffPlan().getRestaurant() != null
                        && (rid == null || r.getTariffPlan().getRestaurant().getId().equals(rid)))
                .collect(Collectors.toMap(TariffRule::getId, r -> r, (a, b) -> a));

        Map<String, Map<String, Long>> visitsByDayAndTariffPlan = new TreeMap<>();
        Map<String, Map<String, Long>> visitsByDayAndRuleType = new TreeMap<>();
        Map<String, Map<String, Long>> visitsByDayAndRuleId = new TreeMap<>();

        for (Booking b : bookings) {
            LocalDateTime eventTime = b.getPaidAt() != null ? b.getPaidAt() : b.getStartAt();
            String dayStr = eventTime.toLocalDate().toString();

            String planLabel = "Без тарифа";
            if (b.getActivity() != null && b.getActivity().getTariffPlan() != null
                    && b.getActivity().getTariffPlan().getName() != null) {
                planLabel = b.getActivity().getTariffPlan().getName();
            }
            visitsByDayAndTariffPlan.computeIfAbsent(dayStr, k -> new LinkedHashMap<>()).merge(planLabel, 1L, Long::sum);

            if (b.getPricingRun() != null && b.getPricingRun().getAppliedRules() != null) {
                for (Long ruleId : parseAppliedRuleIds(b.getPricingRun().getAppliedRules())) {
                    TariffRule rule = ruleById.get(ruleId);
                    if (rule != null) {
                        String rt = rule.getRuleType().name();
                        visitsByDayAndRuleType.computeIfAbsent(dayStr, k -> new LinkedHashMap<>()).merge(rt, 1L, Long::sum);
                        String ruleKey = "id" + ruleId + " (" + rt + ")";
                        visitsByDayAndRuleId.computeIfAbsent(dayStr, k -> new LinkedHashMap<>()).merge(ruleKey, 1L, Long::sum);
                    }
                }
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("visitsByDayAndTariffPlan", visitsByDayAndTariffPlan);
        out.put("visitsByDayAndRuleType", visitsByDayAndRuleType);
        out.put("visitsByDayAndRuleId", visitsByDayAndRuleId);
        out.put("totalPaidBookings", bookings.size());
        out.put("note", "Одно оплаченное бронирование = одно посещение (число гостей в брони в БД не хранится).");
        return out;
    }

    private static List<Long> parseAppliedRuleIds(String appliedRules) {
        if (appliedRules == null || appliedRules.isBlank()) {
            return List.of();
        }
        String s = appliedRules.trim();
        if (s.startsWith("[") && s.endsWith("]")) {
            s = s.substring(1, s.length() - 1);
        }
        List<Long> out = new ArrayList<>();
        for (String part : s.split(",")) {
            try {
                out.add(Long.parseLong(part.trim()));
            } catch (NumberFormatException ignored) {
                // skip
            }
        }
        return out;
    }
    
    @Transactional(readOnly = true)
    public Map<String, Object> getPricingRulesImpact(LocalDate from, LocalDate to, Long restaurantId) {
        Long currentRestaurantId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        
        LocalDateTime fromDateTime = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDateTime = to != null ? to.atTime(23, 59, 59, 999_999_999) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        
        // Собираем ID pricing_run-ов, связанных с оплаченными бронированиями
        java.util.Set<Long> paidPricingRunIds = bookingRepository.findAll().stream()
            .filter(b -> b.getStatus() == com.restaurant.model.Booking.BookingStatus.PAID)
            .filter(b -> (currentRestaurantId == null ||
                (b.getBranch() != null && b.getBranch().getId().equals(currentRestaurantId))))
            .filter(b -> {
                LocalDateTime paidAt = b.getPaidAt() != null ? b.getPaidAt() : b.getCreatedAt();
                return !paidAt.isBefore(fromDateTime) && !paidAt.isAfter(toDateTime);
            })
            .filter(b -> b.getPricingRun() != null)
            .map(b -> b.getPricingRun().getId())
            .collect(Collectors.toSet());
        
        // Получаем pricing runs только для оплаченных бронирований
        List<com.restaurant.model.PricingRun> runs = pricingRunRepository.findAll().stream()
            .filter(run -> paidPricingRunIds.contains(run.getId()))
            .collect(Collectors.toList());
        
        // Агрегируем по правилам
        Map<Long, Map<String, Object>> rulesMap = new HashMap<>();
        for (com.restaurant.model.PricingRun run : runs) {
            if (run.getAppliedRules() != null && !run.getAppliedRules().isEmpty()) {
                // Парсим JSON массив или разделённую запятыми строку
                String appliedRulesStr = run.getAppliedRules().trim();
                // Если это JSON массив, убираем скобки
                if (appliedRulesStr.startsWith("[") && appliedRulesStr.endsWith("]")) {
                    appliedRulesStr = appliedRulesStr.substring(1, appliedRulesStr.length() - 1);
                }
                String[] ruleIds = appliedRulesStr.split(",");
                for (String ruleIdStr : ruleIds) {
                    try {
                        Long ruleId = Long.parseLong(ruleIdStr.trim());
                        rulesMap.computeIfAbsent(ruleId, k -> {
                            Map<String, Object> ruleData = new HashMap<>();
                            ruleData.put("triggerCount", 0);
                            ruleData.put("totalImpact", 0.0);
                            return ruleData;
                        });
                        Map<String, Object> ruleData = rulesMap.get(ruleId);
                        ruleData.put("triggerCount", ((Integer) ruleData.get("triggerCount")) + 1);
                        double amount = run.getTotalAmount() != null ? run.getTotalAmount().doubleValue() : 0.0;
                        ruleData.put("totalImpact", ((Double) ruleData.get("totalImpact")) + amount);
                    } catch (NumberFormatException e) {
                        // Игнорируем некорректные ID
                    }
                }
            }
        }
        
        Map<String, Object> impact = new HashMap<>();
        impact.put("rules", rulesMap);
        impact.put("totalImpact", rulesMap.values().stream()
            .mapToDouble(r -> ((Double) r.get("totalImpact")))
            .sum());
        return impact;
    }
    
    @Transactional(readOnly = true)
    public Map<String, Object> getStopCheckAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        Long currentRestaurantId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        
        LocalDateTime fromDateTime = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDateTime = to != null ? to.atTime(23, 59, 59, 999_999_999) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        
        // Получаем все pricing runs со статусом STOP
        List<com.restaurant.model.PricingRun> stoppedRuns = pricingRunRepository.findAll().stream()
            .filter(run -> run.getStatus() == com.restaurant.model.PricingRun.PricingStatus.STOP)
            .filter(run -> (currentRestaurantId == null || 
                (run.getRestaurant() != null && run.getRestaurant().getId().equals(currentRestaurantId))))
            .filter(run -> {
                LocalDateTime createdAt = run.getCreatedAt();
                return !createdAt.isBefore(fromDateTime) && !createdAt.isAfter(toDateTime);
            })
            .collect(Collectors.toList());
        
        // Группируем по причинам
        Map<String, Integer> reasonsMap = new HashMap<>();
        for (com.restaurant.model.PricingRun run : stoppedRuns) {
            String reason = run.getStopReason() != null ? run.getStopReason() : "UNKNOWN";
            reasonsMap.merge(reason, 1, Integer::sum);
        }
        
        Map<String, Object> analytics = new HashMap<>();
        analytics.put("triggerCount", stoppedRuns.size());
        analytics.put("reasons", reasonsMap);
        return analytics;
    }
    
    @Transactional(readOnly = true)
    public List<TopDishDto> getTopDishes(LocalDate from, LocalDate to, int limit, Long restaurantId) {
        Long currentRestaurantId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        
        LocalDateTime fromDateTime = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDateTime = to != null ? to.atTime(23, 59, 59, 999_999_999) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        
        Pageable pageable = PageRequest.of(0, limit);
        List<Object[]> results = orderItemRepository.getTopDishesBySales(
            currentRestaurantId, fromDateTime, toDateTime, pageable
        );
        
        List<TopDishDto> topDishes = new ArrayList<>();
        for (Object[] row : results) {
            Long dishId = ((Number) row[0]).longValue();
            String dishName = (String) row[1];
            Long totalSold = ((Number) row[2]).longValue();
            BigDecimal revenue = row.length > 3 && row[3] != null
                ? (row[3] instanceof BigDecimal ? (BigDecimal) row[3] : BigDecimal.valueOf(((Number) row[3]).doubleValue()))
                : BigDecimal.ZERO;
            
            topDishes.add(new TopDishDto(dishId, dishName, totalSold, revenue));
        }
        
        return topDishes;
    }
    
    @Transactional(readOnly = true)
    public List<ProblemIngredientDto> getProblemIngredients(Long restaurantId) {
        Long currentRestaurantId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        
        List<com.restaurant.model.Ingredient> ingredients = ingredientRepository.findIngredientsBelowMinimum(currentRestaurantId);
        
        return ingredients.stream()
            .map(ing -> new ProblemIngredientDto(
                ing.getId(),
                ing.getName(),
                ing.getStockQty(),
                ing.getMinQty(),
                ing.getUnit(),
                "LOW_STOCK"
            ))
            .collect(Collectors.toList());
    }
    
    @Transactional(readOnly = true)
    public List<IngredientUsageDto> getIngredientUsage(LocalDate from, LocalDate to, Long restaurantId) {
        Long currentRestaurantId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        
        LocalDateTime fromDateTime = from != null ? from.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDateTime = to != null ? to.atTime(23, 59, 59, 999_999_999) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        
        List<Object[]> results = stockMovementRepository.getIngredientUsageForSales(
            currentRestaurantId, fromDateTime, toDateTime
        );
        
        // Получаем ингредиенты для получения unit
        return results.stream()
            .map(row -> {
                Long ingredientId = ((Number) row[0]).longValue();
                Double totalUsed = ((Number) row[1]).doubleValue();
                
                com.restaurant.model.Ingredient ingredient = ingredientRepository.findById(ingredientId).orElse(null);
                String ingredientName = ingredient != null ? ingredient.getName() : "Unknown";
                Unit unit = ingredient != null ? ingredient.getUnit() : Unit.G;
                
                return new IngredientUsageDto(ingredientId, ingredientName, totalUsed, unit);
            })
            .collect(Collectors.toList());
    }
}
