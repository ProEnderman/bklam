package com.restaurant.service;

import com.restaurant.forecast.ForecastUpdateInProgressStore;
import com.restaurant.forecast.InternalForecastJwtService;
import com.restaurant.model.Restaurant;
import com.restaurant.repository.RestaurantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;

/**
 * По понедельникам в 03:00 запускает прогнозирование на месяц вперёд
 * для каждого ресторана по очереди (summary с horizon=31).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ForecastSchedulerService {

    @Value("${forecast.service.url:http://localhost:8090}")
    private String forecastServiceUrl;

    private final RestaurantRepository restaurantRepository;
    private final InternalForecastJwtService internalForecastJwtService;
    private final ForecastUpdateInProgressStore updateInProgressStore;
    private final RestTemplate restTemplate = new RestTemplate();

    /** Каждый понедельник в 03:00 — прогноз на 31 день для всех ресторанов по очереди. */
    @Scheduled(cron = "${forecast.schedule.cron:0 0 3 ? * MON}")
    @SchedulerLock(name = "ForecastScheduler.weeklyForecast", lockAtLeastFor = "30s", lockAtMostFor = "12h")
    public void runWeeklyForecastForAllRestaurants() {
        List<Long> restaurantIds = restaurantRepository.findAll().stream()
                .map(Restaurant::getId)
                .toList();
        if (restaurantIds.isEmpty()) {
            log.info("Forecast schedule: no restaurants, skip");
            return;
        }
        log.info("Forecast schedule: starting monthly forecast for {} restaurant(s)", restaurantIds.size());
        int horizon = 30;
        int ok = 0;
        int failed = 0;
        for (Long restaurantId : restaurantIds) {
            updateInProgressStore.setInProgress(restaurantId, true);
            try {
                String url = String.format("%s/api/forecast/summary?horizon=%d&restaurant_id=%d",
                        forecastServiceUrl.trim().replaceAll("/$", ""), horizon, restaurantId);
                String token = internalForecastJwtService.issue(restaurantId);
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(token);
                HttpEntity<Void> entity = new HttpEntity<>(headers);
                ResponseEntity<String> resp = restTemplate.exchange(url, HttpMethod.GET, entity, String.class);
                if (resp.getStatusCode().is2xxSuccessful()) {
                    ok++;
                    log.debug("Forecast schedule: restaurant {} OK", restaurantId);
                } else {
                    failed++;
                    log.warn("Forecast schedule: restaurant {} returned {}", restaurantId, resp.getStatusCode());
                }
            } catch (RestClientException e) {
                failed++;
                log.warn("Forecast schedule: restaurant {} failed: {}", restaurantId, e.getMessage());
            } finally {
                updateInProgressStore.setInProgress(restaurantId, false);
            }
        }
        log.info("Forecast schedule: finished — {} OK, {} failed", ok, failed);
    }
}
