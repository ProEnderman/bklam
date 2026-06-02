package com.restaurant.service;

import com.restaurant.observability.BusinessMetrics;
import com.restaurant.dto.ForecastOrderRow;
import com.restaurant.dto.ForecastTariffBookingActivityRow;
import com.restaurant.dto.ForecastTariffBookingRow;
import com.restaurant.dto.ForecastTariffRevenueRow;
import com.restaurant.exception.BusinessException;
import com.restaurant.repository.BookingRepository;
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
    private final BookingRepository bookingRepository;

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
        Long restaurantId = resolveBranchId();
        validateDateRange(from, to);
        List<Object[]> rows = orderRepository.findDailyOrderAggregates(restaurantId, from, to);
        return rows.stream()
                .map(row -> new ForecastOrderRow(
                        parseDay(row[0]),
                        (BigDecimal) row[1],
                        row[2] != null ? ((Number) row[2]).intValue() : 0
                ))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ForecastTariffBookingRow> getTariffBookingsData(LocalDate from, LocalDate to) {
        businessMetrics.incrementForecastRequest();
        try {
            return getTariffBookingsDataInternal(from, to);
        } catch (RuntimeException e) {
            businessMetrics.incrementForecastFailure();
            throw e;
        }
    }

    private List<ForecastTariffBookingRow> getTariffBookingsDataInternal(LocalDate from, LocalDate to) {
        Long branchId = resolveBranchId();
        validateDateRange(from, to);
        return bookingRepository.findDailyPaidBookingCounts(branchId, from, to).stream()
                .map(row -> new ForecastTariffBookingRow(parseDay(row[0]), ((Number) row[1]).longValue()))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ForecastTariffRevenueRow> getTariffRevenueData(LocalDate from, LocalDate to) {
        businessMetrics.incrementForecastRequest();
        try {
            return getTariffRevenueDataInternal(from, to);
        } catch (RuntimeException e) {
            businessMetrics.incrementForecastFailure();
            throw e;
        }
    }

    private List<ForecastTariffRevenueRow> getTariffRevenueDataInternal(LocalDate from, LocalDate to) {
        Long branchId = resolveBranchId();
        validateDateRange(from, to);
        return bookingRepository.findDailyPaidBookingRevenue(branchId, from, to).stream()
                .map(row -> new ForecastTariffRevenueRow(parseDay(row[0]), (BigDecimal) row[1]))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ForecastTariffBookingActivityRow> getTariffBookingsByActivityData(LocalDate from, LocalDate to) {
        businessMetrics.incrementForecastRequest();
        try {
            return getTariffBookingsByActivityInternal(from, to);
        } catch (RuntimeException e) {
            businessMetrics.incrementForecastFailure();
            throw e;
        }
    }

    private List<ForecastTariffBookingActivityRow> getTariffBookingsByActivityInternal(LocalDate from, LocalDate to) {
        Long branchId = resolveBranchId();
        validateDateRange(from, to);
        return bookingRepository.findDailyPaidBookingCountsByActivity(branchId, from, to).stream()
                .map(row -> new ForecastTariffBookingActivityRow(
                        ((Number) row[0]).longValue(),
                        row[1] != null ? row[1].toString() : "Activity",
                        parseDay(row[2]),
                        ((Number) row[3]).longValue()))
                .collect(Collectors.toList());
    }

    private Long resolveBranchId() {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            restaurantId = TenantContext.getRestaurantId();
        }
        if (restaurantId == null) {
            throw new BusinessException("Restaurant context required for forecast data");
        }
        return restaurantId;
    }

    private static void validateDateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || !from.isBefore(to.plusDays(1))) {
            throw new BusinessException("Invalid date range");
        }
    }

    private static LocalDate parseDay(Object raw) {
        if (raw instanceof LocalDate ld) {
            return ld;
        }
        if (raw instanceof java.sql.Date sd) {
            return sd.toLocalDate();
        }
        return LocalDate.parse(raw.toString());
    }
}
