package com.restaurant.service;

import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Calendar;
import com.restaurant.model.TariffPlan;
import com.restaurant.model.TariffSpecialDateModifier;
import com.restaurant.repository.CalendarRepository;
import com.restaurant.repository.TariffPlanRepository;
import com.restaurant.repository.TariffSpecialDateModifierRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TariffSpecialDateModifierService {
    
    private final TariffSpecialDateModifierRepository modifierRepository;
    private final TariffPlanRepository tariffPlanRepository;
    private final CalendarRepository calendarRepository;
    private final ActivityLogService activityLogService;
    
    @Transactional(readOnly = true)
    public List<TariffSpecialDateModifier> getModifiersForTariff(Long tariffPlanId) {
        return modifierRepository.findByTariffPlanId(tariffPlanId);
    }
    
    @Transactional(readOnly = true)
    public TariffSpecialDateModifier getModifierForDate(Long tariffPlanId, LocalDate date) {
        return modifierRepository.findByTariffPlanIdAndDate(tariffPlanId, date)
            .orElse(null);
    }
    
    /**
     * Инициализация модификаторов для всех особых дат календаря тарифа
     * Вызывается при привязке календаря к тарифу
     */
    @Transactional
    public void initializeModifiersForCalendar(Long tariffPlanId, Long calendarId) {
        TariffPlan tariff = tariffPlanRepository.findById(tariffPlanId)
            .orElseThrow(() -> new ResourceNotFoundException("Tariff plan not found"));
        Calendar calendar = calendarRepository.findById(calendarId)
            .orElseThrow(() -> new ResourceNotFoundException("Calendar not found"));
        
        // Создаём модификаторы для всех особых дат календаря с value=0 (без изменений)
        for (LocalDate date : calendar.getSpecialDates()) {
            if (!modifierRepository.findByTariffPlanIdAndDate(tariffPlanId, date).isPresent()) {
                TariffSpecialDateModifier modifier = new TariffSpecialDateModifier();
                modifier.setTariffPlan(tariff);
                modifier.setDate(date);
                modifier.setModifierType(TariffSpecialDateModifier.ModifierType.PERCENT_INCREASE);
                modifier.setModifierValue(BigDecimal.ZERO); // По умолчанию без изменений
                modifierRepository.save(modifier);
            }
        }
    }
    
    /**
     * Добавление модификатора для новой особой даты (когда в календарь добавляется новая дата)
     */
    @Transactional
    public void addModifierForNewDate(Long tariffPlanId, LocalDate date) {
        TariffPlan tariff = tariffPlanRepository.findById(tariffPlanId)
            .orElseThrow(() -> new ResourceNotFoundException("Tariff plan not found"));
        
        if (!modifierRepository.findByTariffPlanIdAndDate(tariffPlanId, date).isPresent()) {
            TariffSpecialDateModifier modifier = new TariffSpecialDateModifier();
            modifier.setTariffPlan(tariff);
            modifier.setDate(date);
            modifier.setModifierType(TariffSpecialDateModifier.ModifierType.PERCENT_INCREASE);
            modifier.setModifierValue(BigDecimal.ZERO); // По умолчанию без изменений
            modifierRepository.save(modifier);
        }
    }
    
    /**
     * Bulk upsert модификаторов для всех особых дат календаря
     */
    @Transactional
    public void upsertModifiers(Long tariffPlanId, Map<LocalDate, Map<String, Object>> modifiers) {
        TariffPlan tariff = tariffPlanRepository.findById(tariffPlanId)
            .orElseThrow(() -> new ResourceNotFoundException("Tariff plan not found"));
        
        for (Map.Entry<LocalDate, Map<String, Object>> entry : modifiers.entrySet()) {
            LocalDate date = entry.getKey();
            Map<String, Object> modifierData = entry.getValue();
            
            TariffSpecialDateModifier modifier = modifierRepository
                .findByTariffPlanIdAndDate(tariffPlanId, date)
                .orElse(new TariffSpecialDateModifier());
            
            modifier.setTariffPlan(tariff);
            modifier.setDate(date);
            
            if (modifierData.containsKey("modifierType")) {
                modifier.setModifierType(TariffSpecialDateModifier.ModifierType.valueOf(
                    modifierData.get("modifierType").toString()));
            }
            
            if (modifierData.containsKey("modifierValue")) {
                Object value = modifierData.get("modifierValue");
                if (value instanceof Number) {
                    modifier.setModifierValue(BigDecimal.valueOf(((Number) value).doubleValue()));
                } else if (value instanceof String) {
                    modifier.setModifierValue(new BigDecimal((String) value));
                }
            }
            
            // Переопределение времени работы для конкретной даты
            if (modifierData.containsKey("bookingTimeFrom")) {
                Object btf = modifierData.get("bookingTimeFrom");
                if (btf == null || (btf instanceof String && ((String) btf).isEmpty())) {
                    modifier.setBookingTimeFrom(null);
                } else if (btf instanceof String) {
                    modifier.setBookingTimeFrom(LocalTime.parse((String) btf, DateTimeFormatter.ofPattern("HH:mm")));
                }
            }
            
            if (modifierData.containsKey("bookingTimeTo")) {
                Object btt = modifierData.get("bookingTimeTo");
                if (btt == null || (btt instanceof String && ((String) btt).isEmpty())) {
                    modifier.setBookingTimeTo(null);
                } else if (btt instanceof String) {
                    modifier.setBookingTimeTo(LocalTime.parse((String) btt, DateTimeFormatter.ofPattern("HH:mm")));
                }
            }
            
            modifierRepository.save(modifier);
        }
    }
    
    @Transactional
    public TariffSpecialDateModifier updateModifier(Long id, TariffSpecialDateModifier modifierUpdate) {
        TariffSpecialDateModifier existing = modifierRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Modifier not found"));
        
        existing.setModifierType(modifierUpdate.getModifierType());
        existing.setModifierValue(modifierUpdate.getModifierValue());
        existing.setBookingTimeFrom(modifierUpdate.getBookingTimeFrom());
        existing.setBookingTimeTo(modifierUpdate.getBookingTimeTo());
        
        TariffSpecialDateModifier saved = modifierRepository.save(existing);
        
        try {
            activityLogService.logActivity(
                "UPDATE", "TARIFF_MODIFIER", saved.getId(), null,
                String.format("Обновлён модификатор тарифа: дата=%s, тип=%s, значение=%s",
                    saved.getDate(), saved.getModifierType(), saved.getModifierValue()),
                null,
                Map.of("date", saved.getDate().toString(),
                       "modifierType", saved.getModifierType().toString(),
                       "modifierValue", saved.getModifierValue().toString())
            );
        } catch (Exception e) {
            log.error("Failed to log modifier update: {}", e.getMessage());
        }
        
        return saved;
    }
    
    @Transactional
    public void deleteModifier(Long id) {
        try {
            activityLogService.logActivity(
                "DELETE", "TARIFF_MODIFIER", id, null,
                String.format("Удалён модификатор тарифа #%d", id),
                null, null
            );
        } catch (Exception e) {
            log.error("Failed to log modifier delete: {}", e.getMessage());
        }
        modifierRepository.deleteById(id);
    }
}



