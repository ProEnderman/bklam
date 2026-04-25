package com.restaurant.service;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.restaurant.model.*;
import com.restaurant.repository.*;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class PricingService {
    
    private final TariffPlanRepository tariffPlanRepository;
    private final TariffRuleRepository tariffRuleRepository;
    private final CalendarRepository calendarRepository;
    private final TariffSpecialDateModifierRepository modifierRepository;
    private final PricingRunRepository pricingRunRepository;
    private final RestaurantRepository restaurantRepository;
    private final ActivityRepository activityRepository;
    private final BookingRepository bookingRepository;
    private final ObjectMapper objectMapper;
    private static final List<Booking.BookingStatus> FULL_VENUE_BLOCKING_STATUSES =
        List.of(Booking.BookingStatus.DRAFT, Booking.BookingStatus.CONFIRMED, Booking.BookingStatus.PAID, Booking.BookingStatus.COMPLETED);
    
    /**
     * Тестовый расчёт (preview) - без сохранения
     */
    @Transactional(readOnly = true)
    public PricingResult preview(PricingRequest request) {
        return calculatePrice(request, false);
    }
    
    /**
     * Боевой расчёт с сохранением
     */
    @Transactional
    public PricingResult run(PricingRequest request) {
        return calculatePrice(request, true);
    }
    
    private PricingResult calculatePrice(PricingRequest request, boolean save) {
        log.debug("Calculating price for request: {}", request);
        
        Long restaurantId = request.getRestaurantId() != null 
            ? request.getRestaurantId() 
            : SecurityUtils.getCurrentRestaurantId();
        
        // Обнуляем секунды/наносекунды для точного расчёта (предотвращаем дробные минуты)
        LocalDateTime serviceStart = request.getServiceStart().withSecond(0).withNano(0);
        LocalDateTime serviceEnd = request.getServiceEnd().withSecond(0).withNano(0);
        LocalDate startDate = serviceStart.toLocalDate();
        LocalDate endDate = serviceEnd.toLocalDate();
        
        log.info("Pricing request received: serviceStart={}, serviceEnd={}, serviceId={}, restaurantId={}, discountPercent={}, discountReason={}", 
            serviceStart, serviceEnd, request.getServiceId(), restaurantId, request.getDiscountPercent(), request.getDiscountReason());
        
        // Получаем активные тарифные планы (используем первую дату для проверки валидности)
        List<TariffPlan> activePlans = new ArrayList<>();
        if (request.getServiceId() != null) {
            Activity activity = activityRepository.findById(request.getServiceId()).orElse(null);
            if (activity != null) {
                validateFullVenueLockConflict(activity, serviceStart, serviceEnd);
            }
            if (activity != null && activity.getTariffPlan() != null) {
                TariffPlan activityPlan = activity.getTariffPlan();
                if (activityPlan.getIsActive() && 
                    (activityPlan.getValidFrom() == null || activityPlan.getValidFrom().isBefore(startDate) || activityPlan.getValidFrom().equals(startDate)) &&
                    (activityPlan.getValidTo() == null || activityPlan.getValidTo().isAfter(startDate) || activityPlan.getValidTo().equals(startDate))) {
                    activePlans.add(activityPlan);
                }
            }
        }
        
        if (activePlans.isEmpty()) {
            // Если у активности нет тарифного плана — возвращаем ошибку,
            // а не берём чужие тарифы ресторана
            if (request.getServiceId() != null) {
                Activity act = activityRepository.findById(request.getServiceId()).orElse(null);
                String actName = act != null ? act.getName() : "#" + request.getServiceId();
                log.warn("Activity '{}' has no tariff plan assigned, cannot calculate price", actName);
                
                PricingResult errResult = new PricingResult();
                errResult.setStatus(PricingRun.PricingStatus.STOP);
                errResult.setStopReason(String.format(
                    "У мероприятия «%s» не назначен тарифный план. Назначьте тарифный план в разделе Мероприятия.", actName));
                errResult.setTotalAmount(BigDecimal.ZERO);
                errResult.setBaseAmount(BigDecimal.ZERO);
                errResult.setBreakdowns(new ArrayList<>());
                
                if (save) {
                    PricingRun pricingRun = new PricingRun();
                    pricingRun.setRestaurant(restaurantRepository.findById(restaurantId).orElse(null));
                    pricingRun.setServiceStart(serviceStart);
                    pricingRun.setServiceEnd(serviceEnd);
                    pricingRun.setTotalAmount(BigDecimal.ZERO);
                    pricingRun.setStatus(PricingRun.PricingStatus.ERROR);
                    pricingRun = pricingRunRepository.save(pricingRun);
                    errResult.setPricingRunId(pricingRun.getId());
                }
                return errResult;
            }
            activePlans = tariffPlanRepository.findActivePlansForDate(restaurantId, startDate);
        }
        
        // Если бронирование переходит через несколько дней, рассчитываем каждый день отдельно
        if (!startDate.equals(endDate) || serviceEnd.toLocalTime().isBefore(serviceStart.toLocalTime()) || 
            serviceEnd.toLocalTime().equals(serviceStart.toLocalTime())) {
            return calculateMultiDayPrice(activePlans, request, serviceStart, serviceEnd, restaurantId, save);
        }
        
        // Бронирование в пределах одного дня - используем старую логику
        LocalDate serviceDate = startDate;
        
        // 3. Проверяем особые даты и определяем выходные
        boolean isWeekend = false;
        boolean isHoliday = false;
        TariffSpecialDateModifier specialDateModifier = null;
        
        // Проверяем особые даты для каждого тарифа (приоритет над выходными)
        for (TariffPlan plan : activePlans) {
            if (plan.getCalendar() != null) {
                com.restaurant.model.Calendar calendar = plan.getCalendar();
                // Проверяем, является ли дата особой
                if (calendar.getSpecialDates().contains(serviceDate)) {
                    isHoliday = true; // Особая дата считается праздником
                    
                    // Проверяем, есть ли правило HOLIDAY с интервалами для этой даты
                    List<TariffRule> holidayRules = tariffRuleRepository.findByTariffPlanIdAndIsActiveTrueOrderByRuleOrderAsc(plan.getId());
                    boolean hasHolidayRule = false;
                    for (TariffRule rule : holidayRules) {
                        if (rule.getRuleType() == TariffRule.RuleType.HOLIDAY && rule.getConditions() != null) {
                            try {
                                Map<String, Object> conditions = objectMapper.readValue(
                                    rule.getConditions(),
                                    new TypeReference<Map<String, Object>>() {}
                                );
                                if (serviceDate.toString().equals(conditions.get("date"))) {
                                    // Найдено правило HOLIDAY для этой даты
                                    hasHolidayRule = true;
                                    break;
                                }
                            } catch (Exception e) {
                                log.error("Error parsing holiday rule conditions", e);
                            }
                        }
                    }
                    
                    // Ищем модификатор особой даты (применяется к базовой цене, даже если есть правило HOLIDAY)
                    Optional<TariffSpecialDateModifier> modifierOpt = 
                        modifierRepository.findByTariffPlanIdAndDate(plan.getId(), serviceDate);
                    if (modifierOpt.isPresent()) {
                        specialDateModifier = modifierOpt.get();
                    }
                    
                    // Если нашли правило HOLIDAY или модификатор, выходим из цикла
                    if (hasHolidayRule || specialDateModifier != null) {
                        break;
                    }
                }
            }
        }
        
        // Если не нашли особую дату, проверяем выходные по календарю
        if (specialDateModifier == null && !isHoliday) {
            isWeekend = isWeekendDay(serviceDate, activePlans);
        }
        
        // 4. Выбираем правила по приоритету
        List<TariffRule> applicableRules = new ArrayList<>();
        for (TariffPlan plan : activePlans) {
            List<TariffRule> rules = tariffRuleRepository.findByTariffPlanIdAndIsActiveTrueOrderByRuleOrderAsc(plan.getId());
            for (TariffRule rule : rules) {
                if (isRuleApplicable(rule, request, serviceDate, isWeekend, isHoliday)) {
                    applicableRules.add(rule);
                }
            }
        }
        
        // 5. Сортируем правила по порядку правила
        applicableRules.sort((r1, r2) -> {
            return Integer.compare(r1.getRuleOrder(), r2.getRuleOrder());
        });
        
        // 6. Применяем правила и рассчитываем стоимость
        PricingResult result = applyRules(applicableRules, request, serviceStart, serviceEnd, specialDateModifier);
        
        // 7. Сохраняем результат (если нужно)
        if (save) {
            savePricingRun(result, request, restaurantId, serviceStart, serviceEnd);
        }
        
        return result;
    }

    private void validateFullVenueLockConflict(Activity activity, LocalDateTime serviceStart, LocalDateTime serviceEnd) {
        Long branchId = activity.getBranchId();
        if (branchId == null) return;
        boolean thisFv = Boolean.TRUE.equals(activity.getFullVenueLock());
        List<Booking> overlaps = bookingRepository.findOverlappingBookingsBranchWide(
            branchId, serviceStart, serviceEnd, FULL_VENUE_BLOCKING_STATUSES
        );
        for (Booking o : overlaps) {
            Activity oa = o.getActivity();
            if (oa == null) continue;
            boolean otherFv = Boolean.TRUE.equals(oa.getFullVenueLock());
            if (!thisFv && !otherFv) continue;
            if (thisFv && !otherFv) {
                throw new com.restaurant.exception.BusinessException(String.format(
                    "Полная бронь «%s» недоступна: в это время уже есть бронь «%s»",
                    activity.getName(), oa.getName()));
            }
            if (!thisFv) {
                throw new com.restaurant.exception.BusinessException(String.format(
                    "В это время площадка полностью занята бронью «%s»",
                    oa.getName()));
            }
            throw new com.restaurant.exception.BusinessException(String.format(
                "На это время уже существует другая полная бронь «%s»",
                oa.getName()));
        }
    }
    
    /**
     * Расчет цены для бронирования, которое переходит через несколько дней
     * Каждый день рассчитывается отдельно с учетом его особых дат и модификаторов
     */
    private PricingResult calculateMultiDayPrice(List<TariffPlan> activePlans, PricingRequest request, 
                                                 LocalDateTime serviceStart, LocalDateTime serviceEnd,
                                                 Long restaurantId, boolean save) {
        log.info("Calculating multi-day price from {} to {}", serviceStart, serviceEnd);
        
        LocalDate startDate = serviceStart.toLocalDate();
        LocalDate endDate = serviceEnd.toLocalDate();
        LocalTime startTime = serviceStart.toLocalTime();
        LocalTime endTime = serviceEnd.toLocalTime();
        
        PricingResult totalResult = new PricingResult();
        totalResult.setStatus(PricingRun.PricingStatus.OK);
        totalResult.setBreakdowns(new ArrayList<>());
        totalResult.setTotalAmount(BigDecimal.ZERO);
        totalResult.setBaseAmount(BigDecimal.ZERO);
        totalResult.setDiscountAmount(BigDecimal.ZERO);
        
        // Обрабатываем каждый день отдельно
        LocalDate currentDate = startDate;
        while (!currentDate.isAfter(endDate)) {
            LocalTime dayStart;
            LocalTime dayEnd;
            
            if (currentDate.equals(startDate) && currentDate.equals(endDate)) {
                // Один день, но переходит через полночь
                dayStart = startTime;
                dayEnd = endTime;
            } else if (currentDate.equals(startDate)) {
                // Первый день - до конца дня (23:59:59.999999999)
                dayStart = startTime;
                dayEnd = LocalTime.of(23, 59, 59, 999999999);
            } else if (currentDate.equals(endDate)) {
                // Последний день - от начала до endTime
                dayStart = LocalTime.MIDNIGHT;
                dayEnd = endTime;
            } else {
                // Промежуточные дни - весь день (00:00 - 23:59:59.999999999)
                dayStart = LocalTime.MIDNIGHT;
                dayEnd = LocalTime.of(23, 59, 59, 999999999);
            }
            
            LocalDateTime dayStartDateTime = LocalDateTime.of(currentDate, dayStart);
            LocalDateTime dayEndDateTime;
            // Если dayEnd = конец дня (23:59:59.999999999), используем полночь следующего дня
            // чтобы Duration.between корректно считал полные минуты (иначе теряем 1 минуту из-за truncation)
            if (dayEnd.equals(LocalTime.of(23, 59, 59, 999999999)) || dayEnd.equals(LocalTime.MAX)) {
                dayEndDateTime = currentDate.plusDays(1).atStartOfDay();
            } else {
                dayEndDateTime = LocalDateTime.of(currentDate, dayEnd);
            }
            
            log.info("Processing day {}: {} - {}", currentDate, dayStartDateTime, dayEndDateTime);
            
            // Для каждого дня определяем особые даты и модификаторы
            boolean isWeekend = false;
            boolean isHoliday = false;
            TariffSpecialDateModifier specialDateModifier = null;
            
            for (TariffPlan plan : activePlans) {
                if (plan.getCalendar() != null) {
                    com.restaurant.model.Calendar calendar = plan.getCalendar();
                    if (calendar.getSpecialDates().contains(currentDate)) {
                        isHoliday = true;
                        
                        // Проверяем правило HOLIDAY
                        List<TariffRule> holidayRules = tariffRuleRepository.findByTariffPlanIdAndIsActiveTrueOrderByRuleOrderAsc(plan.getId());
                        boolean hasHolidayRule = false;
                        for (TariffRule rule : holidayRules) {
                            if (rule.getRuleType() == TariffRule.RuleType.HOLIDAY && rule.getConditions() != null) {
                                try {
                                    Map<String, Object> conditions = objectMapper.readValue(
                                        rule.getConditions(),
                                        new TypeReference<Map<String, Object>>() {}
                                    );
                                    if (currentDate.toString().equals(conditions.get("date"))) {
                                        hasHolidayRule = true;
                                        break;
                                    }
                                } catch (Exception e) {
                                    log.error("Error parsing holiday rule conditions", e);
                                }
                            }
                        }
                        
                        // Ищем модификатор для этого дня
                        Optional<TariffSpecialDateModifier> modifierOpt = 
                            modifierRepository.findByTariffPlanIdAndDate(plan.getId(), currentDate);
                        if (modifierOpt.isPresent()) {
                            specialDateModifier = modifierOpt.get();
                        }
                        
                        if (hasHolidayRule || specialDateModifier != null) {
                            break;
                        }
                    }
                }
            }
            
            if (specialDateModifier == null && !isHoliday) {
                isWeekend = isWeekendDay(currentDate, activePlans);
            }
            
            // Выбираем правила для этого дня
            List<TariffRule> applicableRules = new ArrayList<>();
            for (TariffPlan plan : activePlans) {
                List<TariffRule> rules = tariffRuleRepository.findByTariffPlanIdAndIsActiveTrueOrderByRuleOrderAsc(plan.getId());
                for (TariffRule rule : rules) {
                    if (isRuleApplicable(rule, request, currentDate, isWeekend, isHoliday)) {
                        applicableRules.add(rule);
                    }
                }
            }
            
            applicableRules.sort((r1, r2) -> Integer.compare(r1.getRuleOrder(), r2.getRuleOrder()));
            
            // Рассчитываем цену для этого дня
            PricingResult dayResult = applyRules(applicableRules, request, dayStartDateTime, dayEndDateTime, specialDateModifier);
            
            // Добавляем к общему результату
            totalResult.setBaseAmount(totalResult.getBaseAmount().add(dayResult.getBaseAmount()));
            totalResult.setTotalAmount(totalResult.getTotalAmount().add(dayResult.getTotalAmount()));
            totalResult.setDiscountAmount(totalResult.getDiscountAmount().add(dayResult.getDiscountAmount()));
            // Сохраняем discountPercent и discountReason из первого дня (они одинаковые для всех дней)
            if (totalResult.getDiscountPercent() == null && dayResult.getDiscountPercent() != null) {
                totalResult.setDiscountPercent(dayResult.getDiscountPercent());
                totalResult.setDiscountReason(dayResult.getDiscountReason());
            }
            if (dayResult.getBreakdowns() != null) {
                // Добавляем префикс с датой к каждому breakdown
                for (PricingBreakdownItem item : dayResult.getBreakdowns()) {
                    item.setDescription(String.format("[%s] %s", currentDate, item.getDescription()));
                    totalResult.getBreakdowns().add(item);
                }
            }
            
            log.info("Day {} total: baseAmount={}, totalAmount={}", currentDate, dayResult.getBaseAmount(), dayResult.getTotalAmount());
            
            // Переходим к следующему дню
            currentDate = currentDate.plusDays(1);
        }
        
        log.info("Multi-day total: baseAmount={}, totalAmount={}", totalResult.getBaseAmount(), totalResult.getTotalAmount());
        
        if (save) {
            savePricingRun(totalResult, request, restaurantId, serviceStart, serviceEnd);
        }
        
        return totalResult;
    }
    
    private boolean isWeekendDay(LocalDate date, List<TariffPlan> activePlans) {
        // Проверяем календари всех активных тарифов
        for (TariffPlan plan : activePlans) {
            if (plan.getCalendar() != null) {
                com.restaurant.model.Calendar calendar = plan.getCalendar();
                DayOfWeek dayOfWeek = date.getDayOfWeek();
                
                // Определяем выходные в зависимости от правила календаря
                if (calendar.getWeekendRule() == com.restaurant.model.Calendar.WeekendRule.SAT_SUN) {
                    // Сб/Вс - выходные
                    return dayOfWeek == DayOfWeek.SATURDAY || dayOfWeek == DayOfWeek.SUNDAY;
                } else if (calendar.getWeekendRule() == com.restaurant.model.Calendar.WeekendRule.MON_FRI) {
                    // Пн-Пт - выходные (будни), Сб/Вс - рабочие дни
                    return dayOfWeek != DayOfWeek.SATURDAY && dayOfWeek != DayOfWeek.SUNDAY;
                } else if (calendar.getWeekendRule() == com.restaurant.model.Calendar.WeekendRule.CUSTOM) {
                    // CUSTOM: используем weekendDays для определения выходных
                    if (calendar.getWeekendDays() != null && !calendar.getWeekendDays().isEmpty()) {
                        try {
                            List<Integer> weekendDays = objectMapper.readValue(
                                calendar.getWeekendDays(),
                                new TypeReference<List<Integer>>() {}
                            );
                            // Преобразуем DayOfWeek (MONDAY=1, SUNDAY=7) в наш формат (1=Пн, 7=Вс)
                            int dayNumber = dayOfWeek.getValue(); // MONDAY=1, SUNDAY=7
                            return weekendDays.contains(dayNumber);
                        } catch (Exception e) {
                            log.error("Error parsing weekendDays", e);
                            // При ошибке используем дефолтную логику
                        }
                    }
                }
            }
        }
        
        // По умолчанию: Сб/Вс выходные
        DayOfWeek dayOfWeek = date.getDayOfWeek();
        return dayOfWeek == DayOfWeek.SATURDAY || dayOfWeek == DayOfWeek.SUNDAY;
    }
    
    private boolean isRuleApplicable(TariffRule rule, PricingRequest request, LocalDate date, 
                                     boolean isWeekend, boolean isHoliday) {
        // Проверяем тип правила
        if (rule.getRuleType() == TariffRule.RuleType.WEEKEND && !isWeekend) {
            return false;
        }
        if (rule.getRuleType() == TariffRule.RuleType.HOLIDAY && !isHoliday) {
            return false;
        }
        if (rule.getRuleType() == TariffRule.RuleType.STANDARD && (isWeekend || isHoliday)) {
            return false;
        }
        
        // Проверяем условия (если есть)
        if (rule.getConditions() != null && !rule.getConditions().isEmpty()) {
            return evaluateConditions(rule, request, date);
        }
        
        return true;
    }
    
    private boolean evaluateConditions(TariffRule rule, PricingRequest request, LocalDate date) {
        if (rule.getConditions() == null || rule.getConditions().isEmpty()) {
            return true;
        }
        
        try {
            Map<String, Object> conditions = objectMapper.readValue(
                rule.getConditions(),
                new TypeReference<Map<String, Object>>() {}
            );
            
            // Проверка даты для правил HOLIDAY
            if (conditions.containsKey("date")) {
                String conditionDate = conditions.get("date").toString();
                if (!date.toString().equals(conditionDate)) {
                    return false;
                }
            }
            
            // Проверяем условия (упрощённая версия)
            // В реальной системе здесь должна быть более сложная логика
            if (conditions.containsKey("serviceId") && request.getServiceId() != null) {
                if (!conditions.get("serviceId").equals(request.getServiceId())) {
                    return false;
                }
            }
            
            // Проверка временного интервала. Если время начала и конца совпадают — одна цена на весь день.
            if (conditions.containsKey("timeFrom") && conditions.containsKey("timeTo")) {
                LocalTime timeFrom = LocalTime.parse(conditions.get("timeFrom").toString());
                LocalTime timeTo = LocalTime.parse(conditions.get("timeTo").toString());
                if (timeFrom.equals(timeTo)) {
                    // Один и тот же момент = «круглосуточно», правило применяется в любое время
                    // (не проверяем currentTime)
                } else {
                    LocalTime currentTime = request.getServiceStart().toLocalTime();
                    if (currentTime.isBefore(timeFrom) || currentTime.isAfter(timeTo)) {
                        return false;
                    }
                }
            }
            
            return true;
        } catch (Exception e) {
            log.error("Error evaluating conditions", e);
            return false;
        }
    }
    
    private PricingResult applyRules(List<TariffRule> rules, PricingRequest request, 
                                     LocalDateTime start, LocalDateTime end,
                                     TariffSpecialDateModifier specialDateModifier) {
        PricingResult result = new PricingResult();
        result.setStatus(PricingRun.PricingStatus.OK);
        result.setBreakdowns(new ArrayList<>());
        result.setAppliedRuleIds(new ArrayList<>());
        
        if (rules.isEmpty()) {
            result.setTotalAmount(BigDecimal.ZERO);
            return result;
        }
        
        // Вычисляем длительность в минутах
        long durationMinutes = java.time.Duration.between(start, end).toMinutes();
        
        BigDecimal totalAmount = BigDecimal.ZERO;
        BigDecimal baseAmount = BigDecimal.ZERO;
        
        // Применяем первое подходящее правило (спец тарифы имеют приоритет)
        TariffRule mainRule = rules.stream()
            .filter(r -> r.getRuleType() == TariffRule.RuleType.SPECIAL)
            .findFirst()
            .orElse(rules.get(0));
        
        result.getAppliedRuleIds().add(mainRule.getId());
        
        log.info("=== Pricing: mainRule id={}, type={}, plan={}, formula={}", 
            mainRule.getId(), mainRule.getRuleType(), mainRule.getTariffPlan().getName(), 
            mainRule.getPricingFormula());
        
        // Применяем формулу расчёта
        if (mainRule.getPricingFormula() != null) {
            try {
                Map<String, Object> formula = objectMapper.readValue(
                    mainRule.getPricingFormula(),
                    new TypeReference<Map<String, Object>>() {}
                );
                
                String pricingModel = (String) formula.getOrDefault("model", "FIXED");
                
                switch (pricingModel) {
                    case "FIXED":
                        baseAmount = new BigDecimal(formula.getOrDefault("price", "0").toString());
                        break;
                    case "PER_MINUTE":
                        BigDecimal ratePerMinute = new BigDecimal(formula.getOrDefault("rate", "0").toString());
                        int billableMinutes = (int) durationMinutes;
                        if (mainRule.getFreeMinutes() != null) {
                            billableMinutes = Math.max(0, billableMinutes - mainRule.getFreeMinutes());
                        }
                        baseAmount = ratePerMinute.multiply(BigDecimal.valueOf(billableMinutes));
                        break;
                    case "PER_HOUR":
                        BigDecimal ratePerHour = new BigDecimal(formula.getOrDefault("rate", "0").toString());
                        double hours = durationMinutes / 60.0;
                        baseAmount = ratePerHour.multiply(BigDecimal.valueOf(hours));
                        break;
                    case "TIME_BASED":
                        // Расчет по временным интервалам
                        baseAmount = calculateTimeBased(formula, start, end);
                        log.info("TIME_BASED calculation: baseAmount={}, start={}, end={}", baseAmount, start, end);
                        // Если цена = 0 и есть интервалы, добавляем подсказку в breakdowns
                        if (baseAmount.compareTo(BigDecimal.ZERO) == 0) {
                            @SuppressWarnings("unchecked")
                            List<Map<String, Object>> dbgIntervals = (List<Map<String, Object>>) formula.get("intervals");
                            if (dbgIntervals != null && !dbgIntervals.isEmpty()) {
                                StringBuilder sb = new StringBuilder("Настроенные интервалы: ");
                                for (Map<String, Object> iv : dbgIntervals) {
                                    sb.append(iv.get("timeFrom")).append("-").append(iv.get("timeTo"))
                                      .append(" (₽").append(iv.get("rate")).append("/ч), ");
                                }
                                log.warn("TIME_BASED returned 0 for period {}-{}. {}", 
                                    start.toLocalTime(), end.toLocalTime(), sb);
                            }
                        }
                        break;
                    case "TIERED":
                        baseAmount = calculateTiered(formula, durationMinutes);
                        break;
                    default:
                        baseAmount = BigDecimal.ZERO;
                }
                
                // Применяем коэффициенты
                if (formula.containsKey("coefficient")) {
                    BigDecimal coefficient = new BigDecimal(formula.get("coefficient").toString());
                    baseAmount = baseAmount.multiply(coefficient);
                }
                
            } catch (Exception e) {
                log.error("Error applying pricing formula", e);
                baseAmount = BigDecimal.ZERO;
            }
        } else {
            log.warn("=== Pricing: mainRule id={} has NO pricingFormula! baseAmount will be 0", mainRule.getId());
        }
        
        log.info("=== Pricing: calculated baseAmount={} for rule id={}", baseAmount, mainRule.getId());
        
        // Применяем минимальную/максимальную сумму
        if (mainRule.getMinAmount() != null && baseAmount.compareTo(mainRule.getMinAmount()) < 0) {
            baseAmount = mainRule.getMinAmount();
        }
        if (mainRule.getMaxAmount() != null && baseAmount.compareTo(mainRule.getMaxAmount()) > 0) {
            baseAmount = mainRule.getMaxAmount();
        }
        
        // Округляем
        baseAmount = roundAmount(baseAmount, mainRule.getRoundingType(), mainRule.getRoundingPrecision());
        
        result.setBaseAmount(baseAmount);
        
        // Добавляем breakdown для базовой ставки
        PricingBreakdownItem breakdown = new PricingBreakdownItem();
        breakdown.setLineType(PricingBreakdown.LineType.BASE_RATE);
        
        String baseDescription = "Base rate: " + mainRule.getTariffPlan().getName();
        // Если цена = 0, добавляем диагностику
        if (baseAmount.compareTo(BigDecimal.ZERO) == 0) {
            if (mainRule.getPricingFormula() == null) {
                baseDescription += " ⚠️ Формула расчёта не задана в правиле (ruleId=" + mainRule.getId() + ", тип=" + mainRule.getRuleType() + ")";
            } else {
                try {
                    Map<String, Object> diagFormula = objectMapper.readValue(
                        mainRule.getPricingFormula(),
                        new TypeReference<Map<String, Object>>() {}
                    );
                    String diagModel = (String) diagFormula.getOrDefault("model", "FIXED");
                    if ("TIME_BASED".equals(diagModel)) {
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> diagIntervals = (List<Map<String, Object>>) diagFormula.get("intervals");
                        if (diagIntervals != null && !diagIntervals.isEmpty()) {
                            StringBuilder sb = new StringBuilder();
                            sb.append(" ⚠️ Бронирование ").append(start.toLocalTime()).append("-").append(end.toLocalTime());
                            sb.append(" не покрыто интервалами [");
                            for (int di = 0; di < diagIntervals.size(); di++) {
                                if (di > 0) sb.append(", ");
                                Map<String, Object> dv = diagIntervals.get(di);
                                sb.append(dv.get("timeFrom")).append("-").append(dv.get("timeTo"));
                                sb.append(" ₽").append(dv.get("rate")).append("/ч");
                            }
                            sb.append("] (тип правила: ").append(mainRule.getRuleType()).append(")");
                            baseDescription += sb.toString();
                        } else {
                            baseDescription += " ⚠️ TIME_BASED, но интервалы не заданы";
                        }
                    } else if ("FIXED".equals(diagModel)) {
                        baseDescription += " ⚠️ FIXED, price=" + diagFormula.getOrDefault("price", "0");
                    } else {
                        baseDescription += " ⚠️ model=" + diagModel + ", rate=" + diagFormula.getOrDefault("rate", "0");
                    }
                } catch (Exception ignore) {
                    baseDescription += " ⚠️ Не удалось прочитать формулу";
                }
            }
        }
        
        breakdown.setDescription(baseDescription);
        breakdown.setAmount(baseAmount);
        breakdown.setQuantity(BigDecimal.valueOf(durationMinutes));
        breakdown.setRuleId(mainRule.getId());
        breakdown.setRuleReason("Applied rule: " + mainRule.getRuleType());
        result.getBreakdowns().add(breakdown);
        
        // Применяем модификатор особой даты (если есть) - ПЕРЕД другими правилами
        BigDecimal modifiedAmount = baseAmount;
        if (specialDateModifier != null) {
            BigDecimal modifierValue = specialDateModifier.getModifierValue();
            
            log.info("Applying special date modifier: type={}, value={}, baseAmount={}", 
                specialDateModifier.getModifierType(), modifierValue, baseAmount);
            
            switch (specialDateModifier.getModifierType()) {
                case PERCENT_INCREASE:
                    // Увеличение на процент: +20% (значение = 20)
                    BigDecimal percentIncreaseMultiplier = modifierValue.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP)
                        .add(BigDecimal.ONE);
                    modifiedAmount = baseAmount.multiply(percentIncreaseMultiplier);
                    log.info("PERCENT_INCREASE: multiplier={}, baseAmount={}, modifiedAmount={}", 
                        percentIncreaseMultiplier, baseAmount, modifiedAmount);
                    break;
                case PERCENT_DECREASE:
                    // Уменьшение на процент: -10% (значение = 10)
                    BigDecimal percentDecreaseMultiplier = BigDecimal.ONE
                        .subtract(modifierValue.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
                    modifiedAmount = baseAmount.multiply(percentDecreaseMultiplier);
                    break;
                case FIXED_INCREASE:
                    // Увеличение на фиксированную сумму: +500₽ (значение = 500)
                    modifiedAmount = baseAmount.add(modifierValue);
                    break;
                case FIXED_DECREASE:
                    // Уменьшение на фиксированную сумму: -200₽ (значение = 200)
                    modifiedAmount = baseAmount.subtract(modifierValue);
                    // Не позволяем цене стать отрицательной
                    if (modifiedAmount.compareTo(BigDecimal.ZERO) < 0) {
                        modifiedAmount = BigDecimal.ZERO;
                    }
                    break;
            }
            
            // Добавляем breakdown для модификатора
            PricingBreakdownItem modifierBreakdown = new PricingBreakdownItem();
            modifierBreakdown.setLineType(PricingBreakdown.LineType.COEFFICIENT);
            modifierBreakdown.setDescription(String.format("Special date modifier (%s): %s", 
                specialDateModifier.getModifierType(), 
                specialDateModifier.getDate()));
            modifierBreakdown.setAmount(modifiedAmount.subtract(baseAmount));
            modifierBreakdown.setRuleId(specialDateModifier.getId());
            modifierBreakdown.setRuleReason("Special date: " + specialDateModifier.getDate());
            result.getBreakdowns().add(modifierBreakdown);
        }
        
        totalAmount = modifiedAmount;
        
        // Применяем дополнительные правила (stacking) к модифицированной сумме
        for (TariffRule rule : rules) {
            if (rule.getId().equals(mainRule.getId())) continue;
            
            if (rule.getPricingFormula() != null) {
                try {
                    Map<String, Object> formula = objectMapper.readValue(
                        rule.getPricingFormula(),
                        new TypeReference<Map<String, Object>>() {}
                    );
                    
                    String action = (String) formula.getOrDefault("action", "ADD");
                    BigDecimal value = new BigDecimal(formula.getOrDefault("value", "0").toString());
                    
                    if ("DISCOUNT".equals(action)) {
                        BigDecimal discount = totalAmount.multiply(value).divide(BigDecimal.valueOf(100));
                        totalAmount = totalAmount.subtract(discount);
                        result.setDiscountAmount(result.getDiscountAmount().add(discount));
                        
                        PricingBreakdownItem discountBreakdown = new PricingBreakdownItem();
                        discountBreakdown.setLineType(PricingBreakdown.LineType.DISCOUNT);
                        discountBreakdown.setDescription("Discount: " + value + "%");
                        discountBreakdown.setAmount(discount.negate());
                        discountBreakdown.setRuleId(rule.getId());
                        result.getBreakdowns().add(discountBreakdown);
                    } else if ("ADD".equals(action)) {
                        totalAmount = totalAmount.add(value);
                        
                        PricingBreakdownItem addBreakdown = new PricingBreakdownItem();
                        addBreakdown.setLineType(PricingBreakdown.LineType.OTHER);
                        addBreakdown.setDescription("Additional charge");
                        addBreakdown.setAmount(value);
                        addBreakdown.setRuleId(rule.getId());
                        result.getBreakdowns().add(addBreakdown);
                    }
                } catch (Exception e) {
                    log.error("Error applying additional rule", e);
                }
            }
        }
        
        // Применяем скидку напрямую, если указана в запросе (без проверки условий через JSON)
        if (request.getDiscountPercent() != null && request.getDiscountPercent().compareTo(BigDecimal.ZERO) > 0) {
            log.info("Applying discount: percent={}, reason={}, totalAmount before discount={}", 
                request.getDiscountPercent(), request.getDiscountReason(), totalAmount);
            BigDecimal discount = totalAmount.multiply(request.getDiscountPercent()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            totalAmount = totalAmount.subtract(discount);
            result.setDiscountAmount(result.getDiscountAmount().add(discount));
            result.setDiscountPercent(request.getDiscountPercent());
            result.setDiscountReason(request.getDiscountReason());
            log.info("Discount applied: discount amount={}, totalAmount after discount={}", discount, totalAmount);
            
            PricingBreakdownItem discountBreakdown = new PricingBreakdownItem();
            discountBreakdown.setLineType(PricingBreakdown.LineType.DISCOUNT);
            String discountDesc = "Скидка: " + request.getDiscountPercent() + "%";
            if (request.getDiscountReason() != null && !request.getDiscountReason().trim().isEmpty()) {
                discountDesc += " (" + request.getDiscountReason() + ")";
            }
            discountBreakdown.setDescription(discountDesc);
            discountBreakdown.setAmount(discount.negate());
            result.getBreakdowns().add(discountBreakdown);
        } else {
            log.info("No discount to apply: discountPercent={}", request.getDiscountPercent());
        }
        
        result.setTotalAmount(totalAmount);
        return result;
    }
    
    private BigDecimal calculateTimeBased(Map<String, Object> formula, LocalDateTime start, LocalDateTime end) {
        BigDecimal total = BigDecimal.ZERO;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> intervals = (List<Map<String, Object>>) formula.get("intervals");
        
        if (intervals == null || intervals.isEmpty()) {
            return BigDecimal.ZERO;
        }
        
        LocalDate startDate = start.toLocalDate();
        LocalDate endDate = end.toLocalDate();
        LocalTime bookingStart = start.toLocalTime();
        LocalTime bookingEnd = end.toLocalTime();
        
        log.info("calculateTimeBased: start={}, end={}, startDate={}, endDate={}", 
            start, end, startDate, endDate);
        
        // Если бронирование переходит через полночь (разные даты или время окончания раньше времени начала)
        if (!startDate.equals(endDate) || bookingEnd.isBefore(bookingStart) || bookingEnd.equals(bookingStart)) {
            // Бронирование переходит через полночь - разбиваем на периоды по дням
            LocalDate currentDate = startDate;
            LocalTime currentStart = bookingStart;
            
            while (currentDate.isBefore(endDate) || (currentDate.equals(endDate) && currentStart.isBefore(bookingEnd))) {
                LocalTime periodEnd;
                
                if (currentDate.equals(startDate) && currentDate.equals(endDate)) {
                    // Один день, но переходит через полночь
                    periodEnd = bookingEnd;
                } else if (currentDate.equals(startDate)) {
                    // Первый день - до конца дня
                    periodEnd = LocalTime.MAX;
                } else if (currentDate.equals(endDate)) {
                    // Последний день - от начала до bookingEnd
                    currentStart = LocalTime.MIDNIGHT;
                    periodEnd = bookingEnd;
                } else {
                    // Промежуточные дни - весь день
                    currentStart = LocalTime.MIDNIGHT;
                    periodEnd = LocalTime.MAX;
                }
                
                log.info("Processing period: {} {} - {} {}", currentDate, currentStart, currentDate, periodEnd);
                BigDecimal dayTotal = calculateTimeBasedForPeriod(intervals, currentStart, periodEnd);
                total = total.add(dayTotal);
                log.info("Day total for {}: {}, cumulative total: {}", currentDate, dayTotal, total);
                
                // Переходим к следующему дню
                currentDate = currentDate.plusDays(1);
                currentStart = LocalTime.MIDNIGHT;
            }
        } else {
            // Бронирование в пределах одного дня
            total = calculateTimeBasedForPeriod(intervals, bookingStart, bookingEnd);
        }
        
        return total;
    }
    
    /**
     * Вспомогательная структура для «нормализованного» интервала —
     * интервалы, пересекающие полночь (18:00→02:00), разбиваются на два:
     * 18:00→23:59:59.999 и 00:00→02:00, каждый с той же ставкой.
     */
    private record NormalizedInterval(LocalTime start, LocalTime end, boolean toMidnight, BigDecimal rate, String label) {}

    private BigDecimal calculateTimeBasedForPeriod(List<Map<String, Object>> intervals, LocalTime periodStart, LocalTime periodEnd) {
        BigDecimal total = BigDecimal.ZERO;

        log.info("Calculating TIME_BASED for period {} - {}", periodStart, periodEnd);
        log.info("Total intervals to check: {}", intervals.size());

        // ——— Нормализация: разбиваем интервалы, пересекающие полночь ———
        List<NormalizedInterval> normalized = new ArrayList<>();
        for (Map<String, Object> interval : intervals) {
            LocalTime ivStart = LocalTime.parse(interval.get("timeFrom").toString());
            String timeToStr = interval.get("timeTo").toString();
            BigDecimal rate = new BigDecimal(interval.get("rate").toString());
            String label = ivStart + "-" + timeToStr;

            if ("00:00".equals(timeToStr) || "24:00".equals(timeToStr)) {
                // Явно до полночи → конец дня
                normalized.add(new NormalizedInterval(ivStart, LocalTime.MAX, true, rate, label));
            } else {
                LocalTime ivEnd = LocalTime.parse(timeToStr);
                if (ivStart.equals(ivEnd)) {
                    // Время начала = концу → одна цена на весь день (круглосуточно)
                    normalized.add(new NormalizedInterval(LocalTime.MIDNIGHT, LocalTime.MAX, true, rate, label + " (весь день)"));
                } else if (ivEnd.isAfter(ivStart)) {
                    // Обычный интервал (напр. 10:00-18:00)
                    normalized.add(new NormalizedInterval(ivStart, ivEnd, false, rate, label));
                } else {
                    // Интервал пересекает полночь (напр. 18:00-02:00)
                    // → разбиваем на 18:00-23:59:59.999 и 00:00-02:00
                    log.info("  Splitting cross-midnight interval {} ({}-{}) into two parts", label, ivStart, ivEnd);
                    normalized.add(new NormalizedInterval(ivStart, LocalTime.MAX, true, rate, label + " [до полуночи]"));
                    normalized.add(new NormalizedInterval(LocalTime.MIDNIGHT, ivEnd, false, rate, label + " [после полуночи]"));
                }
            }
        }

        // Сортируем по времени начала
        normalized.sort(Comparator.comparing(NormalizedInterval::start));

        log.info("Normalized to {} sub-intervals", normalized.size());

        // ——— Ищем пересечения ———
        for (int i = 0; i < normalized.size(); i++) {
            NormalizedInterval ni = normalized.get(i);
            log.info("Checking sub-interval #{}: {} - {} (toMidnight={}), rate={}, label='{}'",
                    i + 1, ni.start, ni.end, ni.toMidnight, ni.rate, ni.label);

            boolean hasOverlap;
            if (ni.toMidnight) {
                // Интервал до конца дня: период должен начинаться до конца дня (всегда true)
                // И заканчиваться после начала интервала
                hasOverlap = periodEnd.isAfter(ni.start);
            } else {
                hasOverlap = periodStart.isBefore(ni.end) && periodEnd.isAfter(ni.start);
            }

            log.info("  hasOverlap={} (period {}-{} vs interval {}-{})",
                    hasOverlap, periodStart, periodEnd, ni.start, ni.end);

            if (!hasOverlap) {
                log.info("  ✗ No overlap");
                continue;
            }

            // Начало пересечения — максимальное из начал
            LocalTime overlapStart = periodStart.isAfter(ni.start) ? periodStart : ni.start;

            // Конец пересечения — минимальное из концов
            LocalTime overlapEnd;
            if (ni.toMidnight) {
                overlapEnd = periodEnd;  // interval идёт до конца дня, ограничиваем периодом
            } else {
                overlapEnd = periodEnd.isBefore(ni.end) ? periodEnd : ni.end;
            }

            log.info("  Overlap: {} - {}", overlapStart, overlapEnd);

            if (!overlapStart.isBefore(overlapEnd) && !ni.toMidnight) {
                log.info("  ✗ Overlap start {} >= overlap end {}, skipping", overlapStart, overlapEnd);
                continue;
            }

            // Вычисляем длительность
            long minutes;
            if (overlapEnd.equals(LocalTime.MAX) || overlapEnd.equals(LocalTime.of(23, 59, 59, 999999999))) {
                // Конец дня = 24:00, Duration.between теряет 1 минуту
                minutes = (24 * 60) - (overlapStart.getHour() * 60 + overlapStart.getMinute());
            } else {
                minutes = java.time.Duration.between(overlapStart, overlapEnd).toMinutes();
            }

            if (minutes > 0) {
                double hrs = minutes / 60.0;
                BigDecimal amount = ni.rate.multiply(BigDecimal.valueOf(hrs))
                        .setScale(2, RoundingMode.HALF_UP);
                total = total.add(amount);
                log.info("  ✓ {} мин = {} ч × {} = {}, итого {}", minutes, hrs, ni.rate, amount, total);
            } else {
                log.info("  ✗ Zero minutes for overlap {} - {}", overlapStart, overlapEnd);
            }
        }

        log.info("Total calculated: {}", total);
        return total;
    }
    
    private BigDecimal calculateTiered(Map<String, Object> formula, long durationMinutes) {
        // Упрощённая реализация ступенчатых тарифов
        // В реальной системе должна быть более сложная логика
        BigDecimal total = BigDecimal.ZERO;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tiers = (List<Map<String, Object>>) formula.get("tiers");
        if (tiers != null) {
            long remaining = durationMinutes;
            for (Map<String, Object> tier : tiers) {
                int tierMinutes = ((Number) tier.getOrDefault("minutes", 0)).intValue();
                BigDecimal tierRate = new BigDecimal(tier.getOrDefault("rate", "0").toString());
                long tierUsage = Math.min(remaining, tierMinutes);
                total = total.add(tierRate.multiply(BigDecimal.valueOf(tierUsage)));
                remaining -= tierUsage;
                if (remaining <= 0) break;
            }
        }
        return total;
    }
    
    private BigDecimal roundAmount(BigDecimal amount, TariffRule.RoundingType roundingType, BigDecimal precision) {
        if (roundingType == null) {
            roundingType = TariffRule.RoundingType.STANDARD;
        }
        if (precision == null) {
            precision = BigDecimal.valueOf(0.01);
        }
        
        switch (roundingType) {
            case STANDARD:
            case BANKERS:
                return amount.setScale(2, RoundingMode.HALF_EVEN);
            case UP:
                return amount.setScale(2, RoundingMode.CEILING);
            case DOWN:
                return amount.setScale(2, RoundingMode.FLOOR);
            case TO_ONE:
                return amount.setScale(0, RoundingMode.HALF_UP);
            default:
                return amount.setScale(2, RoundingMode.HALF_UP);
        }
    }
    
    private void savePricingRun(PricingResult result, PricingRequest request, 
                                Long restaurantId, LocalDateTime start, LocalDateTime end) {
        PricingRun pricingRun = new PricingRun();
        pricingRun.setRestaurant(restaurantRepository.findById(restaurantId).orElse(null));
        pricingRun.setServiceStart(start);
        pricingRun.setServiceEnd(end);
        pricingRun.setStatus(result.getStatus());
        pricingRun.setStopReason(result.getStopReason());
        pricingRun.setTotalAmount(result.getTotalAmount());
        pricingRun.setBaseAmount(result.getBaseAmount());
        pricingRun.setDiscountAmount(result.getDiscountAmount());
        
        try {
            pricingRun.setInputParams(objectMapper.writeValueAsString(request));
            pricingRun.setAppliedRules(objectMapper.writeValueAsString(result.getAppliedRuleIds()));
        } catch (Exception e) {
            log.error("Error serializing pricing run data", e);
        }
        
        pricingRun = pricingRunRepository.save(pricingRun);
        
        // Сохраняем breakdown
        if (result.getBreakdowns() != null) {
            int order = 0;
            for (PricingBreakdownItem item : result.getBreakdowns()) {
                PricingBreakdown breakdown = new PricingBreakdown();
                breakdown.setPricingRun(pricingRun);
                breakdown.setTariffRule(tariffRuleRepository.findById(item.getRuleId()).orElse(null));
                breakdown.setLineType(item.getLineType());
                breakdown.setDescription(item.getDescription());
                breakdown.setAmount(item.getAmount());
                breakdown.setQuantity(item.getQuantity());
                breakdown.setRuleReason(item.getRuleReason());
                breakdown.setLineOrder(order++);
                pricingRun.getBreakdowns().add(breakdown);
            }
        }
        
        // Сохраняем с breakdown
        pricingRun = pricingRunRepository.save(pricingRun);
        
        // Устанавливаем ID в результат для обратной связи
        result.setPricingRunId(pricingRun.getId());
    }
    
    // Вспомогательные классы для запроса и результата
    public static class PricingRequest {
        private Long restaurantId;
        private Long orderId;
        private Long serviceId;
        private Long employeeId;
        private Long clientId;
        private BigDecimal discountPercent;
        private String discountReason;
        private String channel;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss", timezone = "UTC")
        private LocalDateTime serviceStart;
        
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss", timezone = "UTC")
        private LocalDateTime serviceEnd;
        private Map<String, Object> additionalParams;
        
        // Getters and setters
        public Long getRestaurantId() { return restaurantId; }
        public void setRestaurantId(Long restaurantId) { this.restaurantId = restaurantId; }
        public Long getOrderId() { return orderId; }
        public void setOrderId(Long orderId) { this.orderId = orderId; }
        public Long getServiceId() { return serviceId; }
        public void setServiceId(Long serviceId) { this.serviceId = serviceId; }
        public Long getEmployeeId() { return employeeId; }
        public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }
        public Long getClientId() { return clientId; }
        public void setClientId(Long clientId) { this.clientId = clientId; }
        public BigDecimal getDiscountPercent() { return discountPercent; }
        public void setDiscountPercent(BigDecimal discountPercent) { this.discountPercent = discountPercent; }
        public String getDiscountReason() { return discountReason; }
        public void setDiscountReason(String discountReason) { this.discountReason = discountReason; }
        public String getChannel() { return channel; }
        public void setChannel(String channel) { this.channel = channel; }
        public LocalDateTime getServiceStart() { return serviceStart; }
        public void setServiceStart(LocalDateTime serviceStart) { this.serviceStart = serviceStart; }
        public LocalDateTime getServiceEnd() { return serviceEnd; }
        public void setServiceEnd(LocalDateTime serviceEnd) { this.serviceEnd = serviceEnd; }
        public Map<String, Object> getAdditionalParams() { return additionalParams; }
        public void setAdditionalParams(Map<String, Object> additionalParams) { this.additionalParams = additionalParams; }
    }
    
    public static class PricingResult {
        private Long pricingRunId; // ID сохранённого PricingRun
        private PricingRun.PricingStatus status;
        private String stopReason;
        private BigDecimal totalAmount;
        private BigDecimal baseAmount;
        private BigDecimal discountAmount = BigDecimal.ZERO;
        private BigDecimal discountPercent;
        private String discountReason;
        private List<Long> appliedRuleIds;
        private List<PricingBreakdownItem> breakdowns;
        
        // Getters and setters
        public Long getPricingRunId() { return pricingRunId; }
        public void setPricingRunId(Long pricingRunId) { this.pricingRunId = pricingRunId; }
        public PricingRun.PricingStatus getStatus() { return status; }
        public void setStatus(PricingRun.PricingStatus status) { this.status = status; }
        public String getStopReason() { return stopReason; }
        public void setStopReason(String stopReason) { this.stopReason = stopReason; }
        public BigDecimal getTotalAmount() { return totalAmount; }
        public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
        public BigDecimal getBaseAmount() { return baseAmount; }
        public void setBaseAmount(BigDecimal baseAmount) { this.baseAmount = baseAmount; }
        public BigDecimal getDiscountAmount() { return discountAmount; }
        public void setDiscountAmount(BigDecimal discountAmount) { this.discountAmount = discountAmount; }
        public BigDecimal getDiscountPercent() { return discountPercent; }
        public void setDiscountPercent(BigDecimal discountPercent) { this.discountPercent = discountPercent; }
        public String getDiscountReason() { return discountReason; }
        public void setDiscountReason(String discountReason) { this.discountReason = discountReason; }
        public List<Long> getAppliedRuleIds() { return appliedRuleIds; }
        public void setAppliedRuleIds(List<Long> appliedRuleIds) { this.appliedRuleIds = appliedRuleIds; }
        public List<PricingBreakdownItem> getBreakdowns() { return breakdowns; }
        public void setBreakdowns(List<PricingBreakdownItem> breakdowns) { this.breakdowns = breakdowns; }
    }
    
    public static class PricingBreakdownItem {
        private PricingBreakdown.LineType lineType;
        private String description;
        private BigDecimal amount;
        private BigDecimal quantity;
        private Long ruleId;
        private String ruleReason;
        
        // Getters and setters
        public PricingBreakdown.LineType getLineType() { return lineType; }
        public void setLineType(PricingBreakdown.LineType lineType) { this.lineType = lineType; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public BigDecimal getAmount() { return amount; }
        public void setAmount(BigDecimal amount) { this.amount = amount; }
        public BigDecimal getQuantity() { return quantity; }
        public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }
        public Long getRuleId() { return ruleId; }
        public void setRuleId(Long ruleId) { this.ruleId = ruleId; }
        public String getRuleReason() { return ruleReason; }
        public void setRuleReason(String ruleReason) { this.ruleReason = ruleReason; }
    }
}

