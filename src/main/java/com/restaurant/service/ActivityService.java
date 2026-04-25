package com.restaurant.service;

import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Activity;
import com.restaurant.repository.ActivityRepository;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ActivityService {
    
    private final ActivityRepository activityRepository;
    private final RestaurantRepository restaurantRepository;
    private final ActivityLogService activityLogService;
    
    @Transactional(readOnly = true)
    public List<Activity> getActivities(Long branchId, Activity.ActivityStatus status) {
        Long currentBranchId = branchId != null ? branchId : SecurityUtils.getCurrentRestaurantId();
        List<Activity> activities;
        if (status != null) {
            activities = activityRepository.findByBranchIdAndStatus(currentBranchId, status);
        } else {
            activities = activityRepository.findActivities(currentBranchId, null);
        }
        // Инициализируем ленивые связи в рамках транзакции
        activities.forEach(activity -> {
            if (activity.getBranch() != null) {
                activity.getBranch().getName(); // Инициализируем прокси Restaurant
            }
            if (activity.getTariffPlan() != null) {
                activity.getTariffPlan().getName(); // Инициализируем прокси TariffPlan
                // Инициализируем calendar внутри tariffPlan
                if (activity.getTariffPlan().getCalendar() != null) {
                    activity.getTariffPlan().getCalendar().getName(); // Инициализируем прокси Calendar
                    // Инициализируем specialDates коллекцию
                    if (activity.getTariffPlan().getCalendar().getSpecialDates() != null) {
                        activity.getTariffPlan().getCalendar().getSpecialDates().size();
                    }
                }
            }
        });
        return activities;
    }
    
    @Transactional(readOnly = true)
    public Activity getActivityById(Long id) {
        Activity activity = activityRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Activity not found"));
        // Инициализируем ленивые связи в рамках транзакции
        if (activity.getBranch() != null) {
            activity.getBranch().getName(); // Инициализируем прокси Restaurant
        }
        if (activity.getTariffPlan() != null) {
            activity.getTariffPlan().getName(); // Инициализируем прокси TariffPlan
            // Инициализируем calendar внутри tariffPlan
            if (activity.getTariffPlan().getCalendar() != null) {
                activity.getTariffPlan().getCalendar().getName(); // Инициализируем прокси Calendar
                // Инициализируем specialDates коллекцию
                if (activity.getTariffPlan().getCalendar().getSpecialDates() != null) {
                    activity.getTariffPlan().getCalendar().getSpecialDates().size();
                }
            }
        }
        return activity;
    }
    
    @Transactional
    public Activity createActivity(Activity activity) {
        Long branchId = SecurityUtils.getCurrentRestaurantId();
        if (branchId != null) {
            activity.setBranch(restaurantRepository.findById(branchId).orElse(null));
        }
        if (activity.getFullVenueLock() == null) {
            activity.setFullVenueLock(false);
        }
        applyFullVenueConstraints(activity);
        Activity saved = activityRepository.save(activity);
        // Инициализируем ленивые связи после сохранения
        if (saved.getBranch() != null) {
            saved.getBranch().getName();
        }
        if (saved.getTariffPlan() != null) {
            saved.getTariffPlan().getName();
            if (saved.getTariffPlan().getCalendar() != null) {
                saved.getTariffPlan().getCalendar().getName();
                if (saved.getTariffPlan().getCalendar().getSpecialDates() != null) {
                    saved.getTariffPlan().getCalendar().getSpecialDates().size();
                }
            }
        }
        
        try {
            activityLogService.logActivity(
                "CREATE", "ACTIVITY", saved.getId(), null,
                String.format("Создана активность: %s", saved.getName()),
                null,
                Map.of("name", saved.getName(),
                       "status", saved.getStatus() != null ? saved.getStatus().toString() : "",
                       "bookingMode", saved.getBookingMode() != null ? saved.getBookingMode().toString() : "")
            );
        } catch (Exception e) {
            log.error("Failed to log activity create: {}", e.getMessage());
        }
        
        return saved;
    }
    
    @Transactional
    public Activity updateActivity(Long id, Activity activityUpdate) {
        Activity existing = getActivityById(id);
        existing.setName(activityUpdate.getName());
        existing.setDescription(activityUpdate.getDescription());
        existing.setStatus(activityUpdate.getStatus());
        existing.setBookingMode(activityUpdate.getBookingMode());
        existing.setConcurrentLimit(activityUpdate.getConcurrentLimit());
        existing.setRequiresResource(activityUpdate.getRequiresResource());
        existing.setGapFiller(activityUpdate.getGapFiller() != null ? activityUpdate.getGapFiller() : false);
        existing.setStopCheckHours(activityUpdate.getStopCheckHours());
        existing.setFullVenueLock(activityUpdate.getFullVenueLock() != null ? activityUpdate.getFullVenueLock() : false);
        existing.setTariffPlan(activityUpdate.getTariffPlan());
        applyFullVenueConstraints(existing);
        Activity saved = activityRepository.save(existing);
        // Инициализируем ленивые связи после сохранения
        if (saved.getBranch() != null) {
            saved.getBranch().getName();
        }
        if (saved.getTariffPlan() != null) {
            saved.getTariffPlan().getName();
            if (saved.getTariffPlan().getCalendar() != null) {
                saved.getTariffPlan().getCalendar().getName();
                if (saved.getTariffPlan().getCalendar().getSpecialDates() != null) {
                    saved.getTariffPlan().getCalendar().getSpecialDates().size();
                }
            }
        }
        
        try {
            activityLogService.logActivity(
                "UPDATE", "ACTIVITY", saved.getId(), null,
                String.format("Обновлена активность: %s", saved.getName()),
                null,
                Map.of("name", saved.getName(),
                       "status", saved.getStatus() != null ? saved.getStatus().toString() : "",
                       "bookingMode", saved.getBookingMode() != null ? saved.getBookingMode().toString() : "")
            );
        } catch (Exception e) {
            log.error("Failed to log activity update: {}", e.getMessage());
        }
        
        return saved;
    }
    
    @Transactional
    public void deleteActivity(Long id) {
        try {
            activityLogService.logActivity(
                "DELETE", "ACTIVITY", id, null,
                String.format("Удалена активность #%d", id),
                null, null
            );
        } catch (Exception e) {
            log.error("Failed to log activity delete: {}", e.getMessage());
        }
        activityRepository.deleteById(id);
    }

    /** Полная бронь: только одна запись, без параллели с другими мероприятиями — фиксируем EXCLUSIVE и лимит 1. */
    private void applyFullVenueConstraints(Activity a) {
        if (Boolean.TRUE.equals(a.getFullVenueLock())) {
            a.setBookingMode(Activity.BookingMode.EXCLUSIVE);
            a.setConcurrentLimit(1);
        }
    }
}



