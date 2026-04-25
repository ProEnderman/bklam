package com.restaurant.service;

import com.restaurant.model.Booking;
import com.restaurant.model.Restaurant;
import com.restaurant.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Month;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for cohort retention: formula (distinct users / cohort size),
 * week boundary (Monday), future weeks = null, 0 = zero retention.
 */
@ExtendWith(MockitoExtension.class)
class CohortRetentionTest {

    @Mock
    private BookingRepository bookingRepository;
    @Mock
    private BookingNotificationRepository notificationRepository;
    @Mock
    private ActivityRepository activityRepository;
    @Mock
    private PricingRunRepository pricingRunRepository;
    @Mock
    private TariffRuleRepository tariffRuleRepository;

    private BookingAnalyticsService service;

    @BeforeEach
    void setUp() {
        service = new BookingAnalyticsService(
                bookingRepository,
                notificationRepository,
                activityRepository,
                pricingRunRepository,
                tariffRuleRepository
        );
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getCohortRetention(LocalDate from, LocalDate to, Long restaurantId) {
        return (Map<String, Object>) ReflectionTestUtils.invokeMethod(service, "getCohortRetention", from, to, restaurantId);
    }

    private static Booking paidBooking(LocalDateTime startAt, String phone, Long branchId) {
        Restaurant branch = new Restaurant();
        branch.setId(branchId);
        Booking b = new Booking();
        b.setBranch(branch);
        b.setStartAt(startAt);
        b.setEndAt(startAt.plusHours(1));
        b.setStatus(Booking.BookingStatus.PAID);
        b.setCustomerName("Client");
        b.setCustomerPhone(phone);
        return b;
    }

    @Test
    void retention_uses_distinct_users_and_cohort_size_denominator() {
        // Monday 2025-01-06 = week start; same client visits W0 and W1
        LocalDateTime w0 = LocalDateTime.of(2025, Month.JANUARY, 6, 12, 0);
        LocalDateTime w1 = LocalDateTime.of(2025, Month.JANUARY, 13, 12, 0);
        List<Booking> bookings = Arrays.asList(
                paidBooking(w0, "+79001111111", 1L),
                paidBooking(w1, "+79001111111", 1L)
        );
        when(bookingRepository.findAll()).thenReturn(bookings);

        LocalDate from = LocalDate.of(2025, 1, 1);
        LocalDate to = LocalDate.of(2025, 1, 31);
        Map<String, Object> cohort = getCohortRetention(from, to, 1L);

        Map<String, List<Double>> weekly = (Map<String, List<Double>>) cohort.get("weeklyMatrix");
        Map<String, Integer> sizes = (Map<String, Integer>) cohort.get("weeklySizes");
        assertThat(weekly).isNotEmpty();
        assertThat(sizes).isNotEmpty();
        String cohortKey = "2025-01-06"; // Monday of first visit
        assertThat(sizes.get(cohortKey)).isEqualTo(1);
        List<Double> row = weekly.get(cohortKey);
        assertThat(row).isNotNull();
        // W0 = 100% (1/1), W1 = 100% (1/1)
        assertThat(row.get(0)).isEqualTo(100.0);
        assertThat(row.get(1)).isEqualTo(100.0);
    }

    @Test
    void future_weeks_are_null() {
        // Use to in the future so refDate = to. Cohort in that week has currentWeekIndex = 0 → W1+ null.
        LocalDateTime w0 = LocalDateTime.of(2030, Month.JANUARY, 1, 12, 0);
        when(bookingRepository.findAll()).thenReturn(List.of(paidBooking(w0, "+79002222222", 1L)));

        LocalDate from = LocalDate.of(2029, 1, 1);
        LocalDate to = LocalDate.of(2030, 1, 1);
        Map<String, Object> cohort = getCohortRetention(from, to, 1L);

        Map<String, List<Double>> weekly = (Map<String, List<Double>>) cohort.get("weeklyMatrix");
        assertThat(weekly).isNotEmpty();
        List<Double> row = weekly.values().iterator().next(); // single cohort row
        assertThat(row).isNotNull();
        assertThat(row.size()).isGreaterThanOrEqualTo(2);
        assertThat(row.get(0)).isEqualTo(100.0); // W0 happened
        assertThat(row.get(1)).isNull();         // W1 is future
        assertThat(row.get(2)).isNull();
    }

    @Test
    void zero_retention_is_zero_not_null() {
        // One client only in W0, no return in W1
        LocalDateTime w0 = LocalDateTime.of(2025, Month.JANUARY, 6, 12, 0);
        when(bookingRepository.findAll()).thenReturn(List.of(paidBooking(w0, "+79003333333", 1L)));

        LocalDate from = LocalDate.of(2025, 1, 1);
        LocalDate to = LocalDate.of(2025, 1, 20); // past W1
        Map<String, Object> cohort = getCohortRetention(from, to, 1L);

        Map<String, List<Double>> weekly = (Map<String, List<Double>>) cohort.get("weeklyMatrix");
        List<Double> row = weekly.get("2025-01-06");
        assertThat(row.get(0)).isEqualTo(100.0);
        assertThat(row.get(1)).isEqualTo(0.0); // 0% retention, not null
    }

    @Test
    void when_period_ends_in_past_old_cohorts_show_numbers_not_dashes() {
        // User selects period ending in the past (e.g. 2023-06-30). refDate must be "today" so past weeks get 0% or value, not null.
        LocalDateTime w0 = LocalDateTime.of(2023, Month.JUNE, 5, 12, 0); // Monday 2023-06-05
        when(bookingRepository.findAll()).thenReturn(List.of(paidBooking(w0, "+79006666666", 1L)));

        LocalDate from = LocalDate.of(2023, 1, 1);
        LocalDate to = LocalDate.of(2023, 6, 30); // past
        Map<String, Object> cohort = getCohortRetention(from, to, 1L);

        Map<String, List<Double>> weekly = (Map<String, List<Double>>) cohort.get("weeklyMatrix");
        assertThat(weekly).isNotEmpty();
        List<Double> row = weekly.values().iterator().next();
        assertThat(row.get(0)).isEqualTo(100.0);
        // W1 has already passed (we're past 2023-06-30), so must be number (0 or value), not null
        assertThat(row.get(1)).isNotNull();
    }

    @Test
    void week_index_uses_monday_boundary() {
        // User first visit Sunday 2025-01-05 → ISO week Monday = 2024-12-30
        LocalDateTime sunday = LocalDateTime.of(2025, Month.JANUARY, 5, 23, 30);
        when(bookingRepository.findAll()).thenReturn(List.of(paidBooking(sunday, "+79004444444", 1L)));

        LocalDate from = LocalDate.of(2024, 12, 25);
        LocalDate to = LocalDate.of(2025, 1, 10);
        Map<String, Object> cohort = getCohortRetention(from, to, 1L);

        Map<String, List<Double>> weekly = (Map<String, List<Double>>) cohort.get("weeklyMatrix");
        assertThat(weekly).containsKey("2024-12-30"); // Monday of week containing Jan 5
    }

}
