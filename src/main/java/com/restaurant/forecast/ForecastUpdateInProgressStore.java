package com.restaurant.forecast;

import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Хранит id ресторанов, для которых сейчас выполняется обновление прогноза
 * (плановое по понедельникам в 03:00 или ручной запуск). Используется для
 * отображения на фронте «Прогноз в процессе обновления».
 */
@Component
public class ForecastUpdateInProgressStore {

    private final Set<Long> inProgress = ConcurrentHashMap.newKeySet();

    public void setInProgress(long restaurantId, boolean updating) {
        if (updating) {
            inProgress.add(restaurantId);
        } else {
            inProgress.remove(restaurantId);
        }
    }

    public boolean isInProgress(Long restaurantId) {
        return restaurantId != null && inProgress.contains(restaurantId);
    }
}
