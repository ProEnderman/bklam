package com.restaurant.service;

import com.restaurant.dto.CalendarUpdateResponse;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Calendar;
import com.restaurant.model.TariffPlan;
import com.restaurant.repository.CalendarRepository;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.TariffPlanRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CalendarService {
    
    private final CalendarRepository calendarRepository;
    private final RestaurantRepository restaurantRepository;
    private final TariffPlanRepository tariffPlanRepository;
    private final ActivityLogService activityLogService;
    
    @Transactional(readOnly = true)
    public List<Calendar> getCalendars(Long organizationId, Long branchId) {
        List<Calendar> calendars;
        if (organizationId != null || branchId != null) {
            calendars = calendarRepository.findByOrganizationIdAndBranchId(organizationId, branchId);
        } else {
            calendars = calendarRepository.findAll();
        }
        // Инициализируем ленивые связи и коллекции в рамках транзакции
        calendars.forEach(c -> {
            if (c.getBranch() != null) {
                c.getBranch().getName(); // Инициализируем прокси
            }
            // Инициализируем коллекцию specialDates
            if (c.getSpecialDates() != null) {
                c.getSpecialDates().size(); // Инициализируем коллекцию
            }
        });
        return calendars;
    }
    
    @Transactional(readOnly = true)
    public Calendar getCalendarById(Long id) {
        Calendar calendar = calendarRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Calendar not found"));
        // Инициализируем ленивые связи и коллекции в рамках транзакции
        if (calendar.getBranch() != null) {
            calendar.getBranch().getName(); // Инициализируем прокси
        }
        // Инициализируем коллекцию specialDates
        if (calendar.getSpecialDates() != null) {
            calendar.getSpecialDates().size(); // Инициализируем коллекцию
        }
        return calendar;
    }
    
    @Transactional
    public Calendar createCalendar(Calendar calendar) {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        
        if (restaurantId != null) {
            var restaurant = restaurantRepository.findById(restaurantId)
                .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found"));
            calendar.setBranch(restaurant);
        }
        
        Calendar saved = calendarRepository.save(calendar);
        // Инициализируем коллекцию после сохранения
        if (saved.getSpecialDates() != null) {
            saved.getSpecialDates().size();
        }
        
        try {
            activityLogService.logActivity(
                "CREATE", "CALENDAR", saved.getId(), null,
                String.format("Создан календарь: %s", saved.getName()),
                null,
                Map.of("name", saved.getName(),
                       "weekendRule", saved.getWeekendRule() != null ? saved.getWeekendRule().toString() : "")
            );
        } catch (Exception e) {
            log.error("Failed to log calendar create: {}", e.getMessage());
        }
        
        return saved;
    }
    
    @Transactional
    public CalendarUpdateResponse updateCalendar(Long id, Calendar calendarUpdate) {
        Calendar existing = getCalendarById(id);
        
        // Сохраняем старые даты для сравнения
        Set<LocalDate> oldDates = new HashSet<>(existing.getSpecialDates());
        Set<LocalDate> newDates = new HashSet<>(calendarUpdate.getSpecialDates() != null ? calendarUpdate.getSpecialDates() : new ArrayList<>());
        
        // Определяем добавленные и удаленные даты
        List<String> addedDates = newDates.stream()
            .filter(date -> !oldDates.contains(date))
            .map(LocalDate::toString)
            .collect(Collectors.toList());
        
        List<String> removedDates = oldDates.stream()
            .filter(date -> !newDates.contains(date))
            .map(LocalDate::toString)
            .collect(Collectors.toList());
        
        existing.setName(calendarUpdate.getName());
        existing.setWeekendRule(calendarUpdate.getWeekendRule());
        existing.setWeekendDays(calendarUpdate.getWeekendDays());
        existing.setSpecialDates(calendarUpdate.getSpecialDates());
        
        Calendar saved = calendarRepository.save(existing);
        // Инициализируем коллекцию после сохранения
        if (saved.getSpecialDates() != null) {
            saved.getSpecialDates().size();
        }
        
        // Находим все тарифные планы, использующие этот календарь
        List<TariffPlan> affectedPlans = tariffPlanRepository.findByCalendarId(id);
        // Инициализируем ленивые связи для тарифных планов
        affectedPlans.forEach(plan -> {
            if (plan.getRestaurant() != null) {
                plan.getRestaurant().getName();
            }
            if (plan.getCalendar() != null && plan.getCalendar().getSpecialDates() != null) {
                plan.getCalendar().getSpecialDates().size();
            }
        });
        
        try {
            activityLogService.logActivity(
                "UPDATE", "CALENDAR", saved.getId(), null,
                String.format("Обновлён календарь: %s (добавлено дат: %d, удалено: %d)",
                    saved.getName(), addedDates.size(), removedDates.size()),
                null,
                Map.of("name", saved.getName(),
                       "addedDates", String.join(", ", addedDates),
                       "removedDates", String.join(", ", removedDates))
            );
        } catch (Exception e) {
            log.error("Failed to log calendar update: {}", e.getMessage());
        }
        
        return new CalendarUpdateResponse(saved, affectedPlans, addedDates, removedDates);
    }
    
    @Transactional
    public void deleteCalendar(Long id) {
        Calendar calendar = getCalendarById(id);
        
        // Проверяем, используется ли календарь тарифами
        if (calendarRepository.isUsedByAnyTariff(id)) {
            throw new BusinessException("Cannot delete calendar: it is used by one or more tariff plans");
        }
        
        try {
            activityLogService.logActivity(
                "DELETE", "CALENDAR", id, null,
                String.format("Удалён календарь: %s", calendar.getName()),
                Map.of("name", calendar.getName()), null
            );
        } catch (Exception e) {
            log.error("Failed to log calendar delete: {}", e.getMessage());
        }
        
        calendarRepository.delete(calendar);
    }
    
    @Transactional
    public void addSpecialDate(Long calendarId, LocalDate date) {
        Calendar calendar = getCalendarById(calendarId);
        if (!calendar.getSpecialDates().contains(date)) {
            calendar.getSpecialDates().add(date);
            Calendar saved = calendarRepository.save(calendar);
            // Инициализируем коллекцию после сохранения
            if (saved.getSpecialDates() != null) {
                saved.getSpecialDates().size();
            }
            
            // Обновляем все тарифы, использующие этот календарь
            updateTariffsForNewSpecialDate(calendarId, date);
        }
    }
    
    @Transactional
    public void removeSpecialDate(Long calendarId, LocalDate date) {
        Calendar calendar = getCalendarById(calendarId);
        calendar.getSpecialDates().remove(date);
        Calendar saved = calendarRepository.save(calendar);
        // Инициализируем коллекцию после сохранения
        if (saved.getSpecialDates() != null) {
            saved.getSpecialDates().size();
        }
    }
    
    /**
     * При добавлении новой особой даты в календарь, все тарифы должны получить модификатор с value=1.0
     * Вызывается из TariffSpecialDateModifierService
     */
    private void updateTariffsForNewSpecialDate(Long calendarId, LocalDate date) {
        // Логика реализована в TariffSpecialDateModifierService.addModifierForNewDate
        // Этот метод можно удалить или оставить для будущего расширения
    }
}

