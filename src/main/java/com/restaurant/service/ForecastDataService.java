package com.restaurant.service;

import com.restaurant.observability.BusinessMetrics;
import com.restaurant.dto.ForecastOrderRow;
import com.restaurant.exception.BusinessException;
import com.restaurant.repository.OrderRepository;
import com.restaurant.security.SecurityUtils;
import com.restaurant.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Read-only, tenant-scoped service for forecast training data export.
 */
@Service
@RequiredArgsConstructor
public class ForecastDataService {

    private final BusinessMetrics businessMetrics;
    private final OrderRepository orderRepository;

    @Transactional(readOnly = true)
    public List<ForecastOrderRow> getOrdersData(LocalDate from, LocalDate to) {
        businessMetrics.incrementForecastRequest();
        try {
            return getOrdersDataInternal(from, to);
        } catch (RuntimeException e) {
            businessMetrics.incrementForecastFailure();
            throw e;
        }
    }

    private List<ForecastOrderRow> getOrdersDataInternal(LocalDate from, LocalDate to) {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            restaurantId = TenantContext.getRestaurantId();
        }
        if (restaurantId == null) {
            throw new BusinessException("Restaurant context required for forecast data");
        }
        if (from == null || to == null || !from.isBefore(to.plusDays(1))) {
            throw new BusinessException("Invalid date range");
        }
        List<Object[]> rows = orderRepository.findDailyOrderAggregates(restaurantId, from, to);
        return rows.stream()
                .map(row -> {
                    LocalDate day;
                    if (row[0] instanceof LocalDate ld) {
                        day = ld;
                    } else if (row[0] instanceof java.sql.Date sd) {
                        day = sd.toLocalDate();
                    } else {
                        day = LocalDate.parse(row[0].toString());
                    }
                    return new ForecastOrderRow(
                        day,
                        (BigDecimal) row[1],
                        row[2] != null ? ((Number) row[2]).intValue() : 0
                    );
                })
                .collect(Collectors.toList());
    }
}
