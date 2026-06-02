package com.restaurant.service;

import com.restaurant.model.*;
import com.restaurant.repository.*;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.time.temporal.IsoFields;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Comprehensive booking analytics service.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BookingAnalyticsService {

    private final BookingRepository bookingRepository;
    private final BookingNotificationRepository notificationRepository;
    private final ActivityRepository activityRepository;
    private final PricingRunRepository pricingRunRepository;
    private final TariffRuleRepository tariffRuleRepository;

    // ───────────────── helpers ─────────────────

    private List<Booking> allBookings(Long restaurantId, LocalDateTime from, LocalDateTime to) {
        Long rid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        return bookingRepository.findAll().stream()
                .filter(b -> rid == null || (b.getBranch() != null && b.getBranch().getId().equals(rid)))
                .filter(b -> !b.getStartAt().isBefore(from) && !b.getStartAt().isAfter(to))
                .collect(Collectors.toList());
    }

    private LocalDateTime startOf(LocalDate d) { return d != null ? d.atStartOfDay() : LocalDateTime.of(1970,1,1,0,0); }
    private LocalDateTime endOf(LocalDate d)   { return d != null ? d.atTime(23,59,59,999_999_999) : LocalDateTime.of(2099,12,31,23,59,59); }

    private double minutes(Booking b) {
        return ChronoUnit.MINUTES.between(b.getStartAt(), b.getEndAt());
    }

    private double amount(Booking b) {
        return b.getTotalAmount() != null ? b.getTotalAmount().doubleValue() : 0.0;
    }

    private String clientKey(Booking b) {
        String name = b.getCustomerName();
        String phone = b.getCustomerPhone();
        if (phone != null && !phone.isBlank()) {
            return name + " (" + phone + ")";
        }
        return name;
    }

    // ═══════════════ 1. VOLUME ═══════════════

    @Transactional(readOnly = true)
    public Map<String, Object> getVolumeAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        List<Booking> all = allBookings(restaurantId, startOf(from), endOf(to));
        Map<String, Object> result = new LinkedHashMap<>();

        // By status
        Map<String, Long> byStatus = all.stream()
                .collect(Collectors.groupingBy(b -> b.getStatus().name(), Collectors.counting()));
        result.put("byStatus", byStatus);

        // By day
        Map<String, Long> byDay = all.stream()
                .collect(Collectors.groupingBy(b -> b.getStartAt().toLocalDate().toString(), Collectors.counting()));
        result.put("byDay", new TreeMap<>(byDay));

        // By week (ISO week)
        Map<String, Long> byWeek = all.stream()
                .collect(Collectors.groupingBy(b -> {
                    LocalDate d = b.getStartAt().toLocalDate();
                    return d.getYear() + "-W" + String.format("%02d", d.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
                }, Collectors.counting()));
        result.put("byWeek", new TreeMap<>(byWeek));

        // By month
        Map<String, Long> byMonth = all.stream()
                .collect(Collectors.groupingBy(b -> {
                    LocalDate d = b.getStartAt().toLocalDate();
                    return d.getYear() + "-" + String.format("%02d", d.getMonthValue());
                }, Collectors.counting()));
        result.put("byMonth", new TreeMap<>(byMonth));

        // By activity
        Map<String, Long> byActivity = all.stream()
                .filter(b -> b.getActivity() != null)
                .collect(Collectors.groupingBy(b -> b.getActivity().getName(), Collectors.counting()));
        result.put("byActivity", byActivity);

        // By client (unique by phone, display as "Name (phone)")
        Map<String, Long> byClient = all.stream()
                .filter(b -> b.getCustomerName() != null && !b.getCustomerName().isBlank())
                .collect(Collectors.groupingBy(this::clientKey, Collectors.counting()));
        result.put("byClient", byClient);

        // Growth MoM / YoY
        result.put("growth", calculateGrowth(byMonth));

        result.put("total", (long) all.size());
        return result;
    }

    private Map<String, Object> calculateGrowth(Map<String, Long> byMonth) {
        Map<String, Object> growth = new LinkedHashMap<>();
        List<String> sortedMonths = new ArrayList<>(new TreeSet<>(byMonth.keySet()));

        // MoM
        Map<String, Double> mom = new LinkedHashMap<>();
        for (int i = 1; i < sortedMonths.size(); i++) {
            long prev = byMonth.getOrDefault(sortedMonths.get(i - 1), 0L);
            long curr = byMonth.getOrDefault(sortedMonths.get(i), 0L);
            double pct = prev > 0 ? ((double)(curr - prev) / prev) * 100 : 0;
            mom.put(sortedMonths.get(i), Math.round(pct * 100.0) / 100.0);
        }
        growth.put("mom", mom);

        // YoY (compare same month, different year)
        Map<String, Double> yoy = new LinkedHashMap<>();
        for (String month : sortedMonths) {
            String[] parts = month.split("-");
            int y = Integer.parseInt(parts[0]);
            String prevYearKey = (y - 1) + "-" + parts[1];
            if (byMonth.containsKey(prevYearKey)) {
                long prev = byMonth.get(prevYearKey);
                long curr = byMonth.getOrDefault(month, 0L);
                double pct = prev > 0 ? ((double)(curr - prev) / prev) * 100 : 0;
                yoy.put(month, Math.round(pct * 100.0) / 100.0);
            }
        }
        growth.put("yoy", yoy);
        return growth;
    }

    // ═══════════════ 2. REVENUE ═══════════════

    @Transactional(readOnly = true)
    public Map<String, Object> getRevenueAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        List<Booking> paid = allBookings(restaurantId, startOf(from), endOf(to)).stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();

        // Total
        double total = paid.stream().mapToDouble(this::amount).sum();
        result.put("total", total);

        // Average
        double avg = paid.isEmpty() ? 0 : total / paid.size();
        result.put("average", Math.round(avg * 100.0) / 100.0);

        // Median
        List<Double> amounts = paid.stream().map(this::amount).sorted().collect(Collectors.toList());
        double median = 0;
        if (!amounts.isEmpty()) {
            int mid = amounts.size() / 2;
            median = amounts.size() % 2 == 0 ? (amounts.get(mid - 1) + amounts.get(mid)) / 2 : amounts.get(mid);
        }
        result.put("median", Math.round(median * 100.0) / 100.0);

        // By activity
        Map<String, Double> byActivity = paid.stream()
                .filter(b -> b.getActivity() != null)
                .collect(Collectors.groupingBy(b -> b.getActivity().getName(),
                        Collectors.summingDouble(this::amount)));
        result.put("byActivity", byActivity);

        // By client (unique by phone, display as "Name (phone)")
        Map<String, Double> byClient = paid.stream()
                .filter(b -> b.getCustomerName() != null && !b.getCustomerName().isBlank())
                .collect(Collectors.groupingBy(this::clientKey,
                        Collectors.summingDouble(this::amount)));
        result.put("byClient", byClient);

        // By hour of day
        Map<Integer, Double> byHour = paid.stream()
                .collect(Collectors.groupingBy(b -> b.getStartAt().getHour(),
                        Collectors.summingDouble(this::amount)));
        result.put("byHour", new TreeMap<>(byHour));

        // By day of week
        Map<String, Double> byDow = paid.stream()
                .collect(Collectors.groupingBy(b -> b.getStartAt().getDayOfWeek().name(),
                        Collectors.summingDouble(this::amount)));
        result.put("byDayOfWeek", byDow);

        // Average duration (minutes)
        double avgDuration = paid.stream().mapToDouble(this::minutes).average().orElse(0);
        result.put("avgDurationMinutes", Math.round(avgDuration * 100.0) / 100.0);

        result.put("count", paid.size());
        return result;
    }

    // ═══════════════ 3. CONVERSION & BEHAVIOUR ═══════════════

    @Transactional(readOnly = true)
    public Map<String, Object> getConversionAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        List<Booking> all = allBookings(restaurantId, startOf(from), endOf(to));
        Map<String, Object> result = new LinkedHashMap<>();

        long total = all.size();
        long drafts = all.stream().filter(b -> b.getStatus() == Booking.BookingStatus.DRAFT).count();
        long confirmed = all.stream().filter(b -> b.getStatus() == Booking.BookingStatus.CONFIRMED).count();
        long paid = all.stream().filter(b -> b.getStatus() == Booking.BookingStatus.PAID).count();
        long cancelled = all.stream().filter(b -> b.getStatus() == Booking.BookingStatus.CANCELLED).count();
        long completed = all.stream().filter(b -> b.getStatus() == Booking.BookingStatus.COMPLETED).count();

        result.put("paymentConversionPct", total > 0 ? round((double) paid / total * 100) : 0);

        // Funnel
        Map<String, Object> funnel = new LinkedHashMap<>();
        funnel.put("total", total);
        funnel.put("draft", drafts);
        funnel.put("confirmed", confirmed + paid + completed); // all that moved past draft
        funnel.put("paid", paid);
        funnel.put("cancelled", cancelled);
        funnel.put("draftToConfirmedPct", total > 0 ? round((double)(confirmed + paid + completed) / total * 100) : 0);
        funnel.put("confirmedToPaidPct", (confirmed + paid + completed) > 0 ?
                round((double) paid / (confirmed + paid + completed) * 100) : 0);
        result.put("funnel", funnel);

        // Conversion by activity
        Map<String, Map<String, Object>> convByActivity = new LinkedHashMap<>();
        Map<String, List<Booking>> grouped = all.stream()
                .filter(b -> b.getActivity() != null)
                .collect(Collectors.groupingBy(b -> b.getActivity().getName()));
        for (var entry : grouped.entrySet()) {
            List<Booking> list = entry.getValue();
            long act_total = list.size();
            long act_paid = list.stream().filter(b -> b.getStatus() == Booking.BookingStatus.PAID).count();
            long act_cancelled = list.stream().filter(b -> b.getStatus() == Booking.BookingStatus.CANCELLED).count();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("total", act_total);
            m.put("paid", act_paid);
            m.put("cancelled", act_cancelled);
            m.put("conversionPct", act_total > 0 ? round((double) act_paid / act_total * 100) : 0);
            m.put("cancelPct", act_total > 0 ? round((double) act_cancelled / act_total * 100) : 0);
            convByActivity.put(entry.getKey(), m);
        }
        result.put("conversionByActivity", convByActivity);

        // Conversion by day of week
        Map<String, Map<String, Object>> convByDow = new LinkedHashMap<>();
        Map<DayOfWeek, List<Booking>> byDow = all.stream()
                .collect(Collectors.groupingBy(b -> b.getStartAt().getDayOfWeek()));
        for (var entry : byDow.entrySet()) {
            List<Booking> list = entry.getValue();
            long d_total = list.size();
            long d_paid = list.stream().filter(b -> b.getStatus() == Booking.BookingStatus.PAID).count();
            long d_cancelled = list.stream().filter(b -> b.getStatus() == Booking.BookingStatus.CANCELLED).count();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("total", d_total);
            m.put("paid", d_paid);
            m.put("cancelled", d_cancelled);
            m.put("conversionPct", d_total > 0 ? round((double) d_paid / d_total * 100) : 0);
            convByDow.put(entry.getKey().name(), m);
        }
        result.put("conversionByDayOfWeek", convByDow);

        // Cancellation
        result.put("cancelRate", total > 0 ? round((double) cancelled / total * 100) : 0);

        // Cancel frequency by client
        Map<String, Long> cancelByClient = all.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.CANCELLED)
                .filter(b -> b.getCustomerName() != null && !b.getCustomerName().isBlank())
                .collect(Collectors.groupingBy(this::clientKey, Collectors.counting()));
        result.put("cancelsByClient", cancelByClient);

        // Repeat clients & LTV
        Map<String, List<Booking>> clientBookings = all.stream()
                .filter(b -> b.getCustomerName() != null && !b.getCustomerName().isBlank())
                .collect(Collectors.groupingBy(this::clientKey));

        long uniqueClients = clientBookings.size();
        long repeatClients = clientBookings.values().stream().filter(l -> l.size() > 1).count();
        result.put("uniqueClients", uniqueClients);
        result.put("repeatClients", repeatClients);
        result.put("retentionRate", uniqueClients > 0 ? round((double) repeatClients / uniqueClients * 100) : 0);

        // LTV by client (paid only)
        Map<String, Object> ltv = new LinkedHashMap<>();
        Map<String, List<Booking>> paidByClient = all.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .filter(b -> b.getCustomerName() != null && !b.getCustomerName().isBlank())
                .collect(Collectors.groupingBy(this::clientKey));
        for (var entry : paidByClient.entrySet()) {
            double sum = entry.getValue().stream().mapToDouble(this::amount).sum();
            int visits = entry.getValue().size();
            Map<String, Object> clientLtv = new LinkedHashMap<>();
            clientLtv.put("totalRevenue", round(sum));
            clientLtv.put("visits", visits);
            clientLtv.put("avgCheck", visits > 0 ? round(sum / visits) : 0);
            ltv.put(entry.getKey(), clientLtv);
        }
        result.put("clientLtv", ltv);

        // Visit frequency (avg days between visits per client)
        Map<String, Double> visitFrequency = new LinkedHashMap<>();
        for (var entry : clientBookings.entrySet()) {
            List<LocalDate> dates = entry.getValue().stream()
                    .map(b -> b.getStartAt().toLocalDate())
                    .distinct()
                    .sorted()
                    .collect(Collectors.toList());
            if (dates.size() > 1) {
                double totalDays = ChronoUnit.DAYS.between(dates.get(0), dates.get(dates.size() - 1));
                visitFrequency.put(entry.getKey(), round(totalDays / (dates.size() - 1)));
            }
        }
        result.put("visitFrequency", visitFrequency);

        return result;
    }

    // ═══════════════ 4. CAPACITY & UTILIZATION ═══════════════

    @Transactional(readOnly = true)
    public Map<String, Object> getCapacityAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        Long rid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        List<Booking> allNonCancelled = allBookings(restaurantId, startOf(from), endOf(to)).stream()
                .filter(b -> b.getStatus() != Booking.BookingStatus.CANCELLED)
                .collect(Collectors.toList());
        List<Booking> paidBookings = allNonCancelled.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .collect(Collectors.toList());
        List<Booking> all = allNonCancelled;

        Map<String, Object> result = new LinkedHashMap<>();

        // Activities with their limits
        List<Activity> activities = activityRepository.findAll().stream()
                .filter(a -> rid == null || (a.getBranch() != null && a.getBranch().getId().equals(rid)))
                .filter(a -> a.getStatus() == Activity.ActivityStatus.ACTIVE)
                .collect(Collectors.toList());

        LocalDateTime periodStart = startOf(from);
        LocalDateTime periodEnd = endOf(to);

        Map<String, Object> activityUtil = new LinkedHashMap<>();
        Map<String, Object> resourceUtil = new LinkedHashMap<>();
        for (Activity act : activities) {
            List<Booking> actBookings = paidBookings.stream()
                    .filter(b -> b.getActivity() != null && b.getActivity().getId().equals(act.getId()))
                    .collect(Collectors.toList());

            int[] opHours = resolveOperatingHours(act.getTariffPlan());
            int operatingHourStart = opHours[0];
            int operatingHourEnd = opHours[1];
            int limit = Math.max(1, act.getConcurrentLimit() != null ? act.getConcurrentLimit() : 1);

            SlotUtilization slotUtil = computeSlotUtilization(
                    actBookings, limit, operatingHourStart, operatingHourEnd, periodStart, periodEnd);

            Map<String, Object> util = new LinkedHashMap<>();
            util.put("bookedHours", round(slotUtil.effectiveSlotHours()));
            util.put("possibleHours", round(slotUtil.possibleSlotHours()));
            util.put("utilization", round(slotUtil.utilizationPct()));
            util.put("peakUtilization", round(slotUtil.peakSlotUtilizationPct()));
            util.put("bookingCount", actBookings.size());
            util.put("concurrentLimit", limit);
            activityUtil.put(act.getName(), util);

            Map<String, Object> resUtil = new LinkedHashMap<>();
            resUtil.put("concurrentLimit", limit);
            resUtil.put("avgConcurrent", round(slotUtil.avgConcurrent()));
            resUtil.put("peakConcurrent", slotUtil.peakConcurrent());
            resUtil.put("avgUtilization", round(slotUtil.avgSlotUtilizationPct()));
            resUtil.put("peakUtilization", round(slotUtil.peakSlotUtilizationPct()));
            resUtil.put("totalBookings", actBookings.size());
            resourceUtil.put(act.getName(), resUtil);
        }
        result.put("activityUtilization", activityUtil);
        result.put("resourceUtilization", resourceUtil);

        // Peak hours (count of bookings per hour)
        Map<Integer, Long> peakHours = paidBookings.stream()
                .collect(Collectors.groupingBy(b -> b.getStartAt().getHour(), Collectors.counting()));
        result.put("peakHours", new TreeMap<>(peakHours));

        // Peak days (count by day of week)
        Map<String, Long> peakDays = all.stream()
                .collect(Collectors.groupingBy(b -> b.getStartAt().getDayOfWeek().name(), Collectors.counting()));
        result.put("peakDays", peakDays);

        // Idle coefficient — slot-based (same model as activity utilization), core activities only
        List<Activity> coreActivities = activities.stream()
                .filter(a -> !Boolean.TRUE.equals(a.getGapFiller()))
                .collect(Collectors.toList());
        double totalEffectiveSlotHours = 0;
        double totalPossibleSlotHours = 0;
        for (Activity act : coreActivities) {
            List<Booking> actBookings = paidBookings.stream()
                    .filter(b -> b.getActivity() != null && b.getActivity().getId().equals(act.getId()))
                    .collect(Collectors.toList());
            int[] opHours = resolveOperatingHours(act.getTariffPlan());
            int limit = Math.max(1, act.getConcurrentLimit() != null ? act.getConcurrentLimit() : 1);
            SlotUtilization slotUtil = computeSlotUtilization(
                    actBookings, limit, opHours[0], opHours[1], periodStart, periodEnd);
            totalEffectiveSlotHours += slotUtil.effectiveSlotHours();
            totalPossibleSlotHours += slotUtil.possibleSlotHours();
        }
        double idleMinutes = Math.max(0, (totalPossibleSlotHours - totalEffectiveSlotHours) * 60);
        result.put("idleCoefficient", totalPossibleSlotHours > 0
                ? round((1 - totalEffectiveSlotHours / totalPossibleSlotHours) * 100) : 100);

        // Gap analysis — exclude gap-filler bookings to measure "natural" gaps
        List<Booking> nonGapFillerBookings = all.stream()
                .filter(b -> !(b.getActivity() != null && Boolean.TRUE.equals(b.getActivity().getGapFiller())))
                .filter(b -> b.getNotes() == null ||
                        (!b.getNotes().contains("Автозаполнение пробела") && !b.getNotes().contains("Пребывание до оплаты")))
                .collect(Collectors.toList());

        Map<String, List<Booking>> byClientGap = nonGapFillerBookings.stream()
                .filter(b -> b.getCustomerName() != null && !b.getCustomerName().isBlank())
                .collect(Collectors.groupingBy(this::clientKey));

        List<Double> gapMinutes = new ArrayList<>();
        long gapFillerCount = 0;
        for (var entry : byClientGap.entrySet()) {
            List<Booking> sorted = entry.getValue().stream()
                    .sorted(Comparator.comparing(Booking::getStartAt))
                    .collect(Collectors.toList());
            for (int i = 1; i < sorted.size(); i++) {
                Booking prev = sorted.get(i - 1);
                Booking curr = sorted.get(i);
                if (prev.getStartAt().toLocalDate().equals(curr.getStartAt().toLocalDate())) {
                    double gap = ChronoUnit.MINUTES.between(prev.getEndAt(), curr.getStartAt());
                    if (gap > 0) gapMinutes.add(gap);
                }
            }
        }
        // Count gap-filler bookings (from original unfiltered list)
        gapFillerCount = all.stream()
                .filter(b -> b.getNotes() != null &&
                        (b.getNotes().contains("Автозаполнение пробела") || b.getNotes().contains("Пребывание до оплаты")))
                .count();

        result.put("avgGapMinutes", gapMinutes.isEmpty() ? 0 : round(gapMinutes.stream().mapToDouble(d -> d).average().orElse(0)));
        result.put("totalGaps", gapMinutes.size());
        result.put("autoGapFillCount", gapFillerCount);

        // Lost revenue estimation based on actual idle capacity (core activities only)
        List<Booking> paidCoreBookings = paidBookings.stream()
                .filter(b -> b.getActivity() != null && !Boolean.TRUE.equals(b.getActivity().getGapFiller()))
                .collect(Collectors.toList());
        double avgHourlyRate = 0;
        if (!paidCoreBookings.isEmpty()) {
            double totalRevenue = paidCoreBookings.stream().mapToDouble(this::amount).sum();
            double totalHours = paidCoreBookings.stream().mapToDouble(b -> minutes(b) / 60.0).sum();
            avgHourlyRate = totalHours > 0 ? totalRevenue / totalHours : 0;
        }
        double idleHours = idleMinutes / 60.0;
        // Use a realistic fill potential: 30% of idle time could be filled (not 100%)
        double realisticFillRate = 0.30;
        result.put("lostRevenueEstimate", round(idleHours * avgHourlyRate * realisticFillRate));
        result.put("idleHours", round(idleHours));
        result.put("avgHourlyRate", round(avgHourlyRate));

        return result;
    }

    // ═══════════════ 5. STOP-CHECK ANALYTICS ═══════════════

    @Transactional(readOnly = true)
    public Map<String, Object> getStopCheckAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        Long rid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        List<Booking> all = allBookings(restaurantId, startOf(from), endOf(to));
        Map<String, Object> result = new LinkedHashMap<>();

        // ── 1. Все бронирования, где сработал стоп-чек ──
        //    Определяем по двум критериям:
        //    a) notes содержат "[стоп-чек]"
        //    b) pricing_run имеет status = 'STOP'
        //    Исключаем CANCELLED
        List<Booking> allStopCheckBookings = all.stream()
                .filter(b -> b.getStatus() != Booking.BookingStatus.CANCELLED)
                .filter(b -> {
                    boolean hasStopNote = b.getNotes() != null && b.getNotes().toLowerCase().contains("стоп-чек");
                    boolean hasStopRun = b.getPricingRun() != null
                            && b.getPricingRun().getStatus() == PricingRun.PricingStatus.STOP;
                    return hasStopNote || hasStopRun;
                })
                .collect(Collectors.toList());

        // ── 2. Средняя ставка за минуту (из обычных платных gap-fillers, без стоп-чека) ──
        Set<Long> stopCheckBookingIds = allStopCheckBookings.stream()
                .map(Booking::getId).collect(Collectors.toSet());
        List<Booking> normalPaidGapFillers = all.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .filter(b -> b.getActivity() != null && Boolean.TRUE.equals(b.getActivity().getGapFiller()))
                .filter(b -> b.getTotalAmount() != null && b.getTotalAmount().compareTo(BigDecimal.ZERO) > 0)
                .filter(b -> !stopCheckBookingIds.contains(b.getId()))
                .collect(Collectors.toList());

        double avgRatePerMinute = 0;
        if (!normalPaidGapFillers.isEmpty()) {
            double totalMin = normalPaidGapFillers.stream().mapToDouble(this::minutes).sum();
            double totalAmt = normalPaidGapFillers.stream().mapToDouble(this::amount).sum();
            avgRatePerMinute = totalMin > 0 ? totalAmt / totalMin : 0;
        }
        final double observedGapFillerRatePerMinute = avgRatePerMinute;

        List<Booking> partiallyFree = allStopCheckBookings.stream()
                .filter(b -> isPartialStopCheck(b, observedGapFillerRatePerMinute))
                .collect(Collectors.toList());
        List<Booking> fullyFree = allStopCheckBookings.stream()
                .filter(b -> !partiallyFree.contains(b))
                .collect(Collectors.toList());

        result.put("triggerCount", allStopCheckBookings.size());
        result.put("fullyFreeCount", fullyFree.size());
        result.put("partiallyFreeCount", partiallyFree.size());

        // ── 3. Средняя сумма до стоп-чека ──
        //    Считаем оплачиваемую часть до порога stop-check для каждого stop-check события.
        Set<String> stopCheckClientKeys = allStopCheckBookings.stream()
                .filter(b -> b.getCustomerName() != null)
                .map(this::clientKey)
                .collect(Collectors.toSet());
        double avgAmountBeforeStop = allStopCheckBookings.stream()
                .mapToDouble(b -> estimatedAmountBeforeStopCheck(b, all, observedGapFillerRatePerMinute))
                .average()
                .orElse(0);
        result.put("avgAmountBeforeStopCheck", round(avgAmountBeforeStop));

        // ── 4. Средняя длительность бесплатного времени после стоп-чека ──
        //    Для полностью бесплатных: все минуты — бесплатные
        //    Для частично бесплатных: бесплатные минуты = общие минуты - оплаченные минуты
        //       где оплаченные = amount / avgRatePerMinute
        double totalFreeMinutes = 0;
        int countWithFreeMinutes = 0;

        for (Booking b : fullyFree) {
            totalFreeMinutes += minutes(b);
            countWithFreeMinutes++;
        }

        if (avgRatePerMinute > 0) {
            for (Booking b : partiallyFree) {
                double totalMin = minutes(b);
                double paidMin = amount(b) / avgRatePerMinute;
                double freeMin = totalMin - paidMin;
                if (freeMin > 0) {
                    totalFreeMinutes += freeMin;
                    countWithFreeMinutes++;
                }
            }
        }

        double avgFreeMinutes = countWithFreeMinutes > 0 ? totalFreeMinutes / countWithFreeMinutes : 0;
        result.put("avgFreeMinutesAfterStopCheck", round(avgFreeMinutes));
        result.put("totalFreeMinutes", round(totalFreeMinutes));

        // ── 5. Потерянная выручка (полностью бесплатные + разница в частично бесплатных) ──
        // Для полностью бесплатных: весь объём минут × ср. ставка
        double lostFromFullyFree = fullyFree.stream().mapToDouble(this::minutes).sum() * avgRatePerMinute;

        // Для частично бесплатных: оцениваем «скидку» как
        //   (полная стоимость по ставке) - (фактически заплаченная сумма)
        double lostFromPartial = 0;
        for (Booking b : partiallyFree) {
            double fullPrice = minutes(b) * avgRatePerMinute;
            double paid = amount(b);
            if (fullPrice > paid) {
                lostFromPartial += (fullPrice - paid);
            }
        }
        result.put("lostRevenueDueToStopCheck", round(lostFromFullyFree + lostFromPartial));
        result.put("lostFromFullyFree", round(lostFromFullyFree));
        result.put("lostFromPartial", round(lostFromPartial));

        // ── 6. Эффективность: выручка клиентов со стоп-чеком vs без ──
        List<Booking> paidAll = all.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .collect(Collectors.toList());

        double revenueFromStopCheckClients = paidAll.stream()
                .filter(b -> b.getCustomerName() != null && stopCheckClientKeys.contains(clientKey(b)))
                .mapToDouble(this::amount).sum();
        double revenueFromOtherClients = paidAll.stream()
                .filter(b -> b.getCustomerName() == null || !stopCheckClientKeys.contains(clientKey(b)))
                .mapToDouble(this::amount).sum();

        result.put("stopCheckClientsCount", stopCheckClientKeys.size());
        result.put("revenueFromStopCheckClients", round(revenueFromStopCheckClients));
        result.put("revenueFromOtherClients", round(revenueFromOtherClients));

        // ── 7. Конфигурации стоп-чека ──
        List<Activity> stopCheckActivities = activityRepository.findAll().stream()
                .filter(a -> rid == null || (a.getBranch() != null && a.getBranch().getId().equals(rid)))
                .filter(a -> Boolean.TRUE.equals(a.getGapFiller()))
                .filter(a -> a.getStopCheckHours() != null && a.getStopCheckHours() > 0)
                .collect(Collectors.toList());

        List<Map<String, Object>> configs = stopCheckActivities.stream().map(a -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("activityName", a.getName());
            m.put("stopCheckHours", a.getStopCheckHours());
            return m;
        }).collect(Collectors.toList());
        result.put("configurations", configs);

        return result;
    }

    // ═══════════════ 6. TARIFF ANALYTICS ═══════════════

    @Transactional(readOnly = true)
    public Map<String, Object> getTariffAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        Long rid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        List<Booking> paid = allBookings(restaurantId, startOf(from), endOf(to)).stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();

        // Average check by tariff plan
        Map<String, List<Booking>> byPlan = paid.stream()
                .filter(b -> b.getActivity() != null && b.getActivity().getTariffPlan() != null)
                .collect(Collectors.groupingBy(b -> b.getActivity().getTariffPlan().getName()));

        Map<String, Object> avgByPlan = new LinkedHashMap<>();
        for (var entry : byPlan.entrySet()) {
            double avg = entry.getValue().stream().mapToDouble(this::amount).average().orElse(0);
            avgByPlan.put(entry.getKey(), round(avg));
        }
        result.put("avgCheckByTariffPlan", avgByPlan);

        // ─── Rule analytics: фильтруем правила по ресторану ───
        List<TariffRule> allRulesGlobal = tariffRuleRepository.findAll();
        List<TariffRule> allRules = allRulesGlobal.stream()
                .filter(r -> {
                    if (rid == null) return true;
                    TariffPlan plan = r.getTariffPlan();
                    return plan != null && plan.getRestaurant() != null
                            && plan.getRestaurant().getId().equals(rid);
                })
                .collect(Collectors.toList());

        Map<Long, TariffRule> ruleMap = allRules.stream()
                .collect(Collectors.toMap(TariffRule::getId, r -> r, (a, b) -> a));

        // Count rule definitions by type
        Map<String, Long> ruleTypeFreq = allRules.stream()
                .collect(Collectors.groupingBy(r -> r.getRuleType().name(), Collectors.counting()));
        result.put("ruleTypeFrequency", ruleTypeFreq);
        result.put("ruleDefinitionCount", allRules.size());

        // ─── PricingRun analytics ───
        Set<Long> paidRunIds = paid.stream()
                .filter(b -> b.getPricingRun() != null)
                .map(b -> b.getPricingRun().getId())
                .collect(Collectors.toSet());

        List<PricingRun> paidRuns = pricingRunRepository.findAll().stream()
                .filter(r -> paidRunIds.contains(r.getId()))
                .collect(Collectors.toList());

        // ─── Pricing model distribution: from ACTUALLY APPLIED rules in paid bookings ───
        // Parse appliedRules (JSON array of rule IDs) from each PricingRun,
        // look up the rule, extract the pricing model from its formula
        Map<String, Long> appliedModelDist = new LinkedHashMap<>();
        Map<String, Long> appliedRuleTypeDist = new LinkedHashMap<>();
        for (PricingRun run : paidRuns) {
            String appliedRulesJson = run.getAppliedRules();
            if (appliedRulesJson == null || appliedRulesJson.isBlank()) continue;

            // Parse JSON array like [1, 2, 3]
            String cleaned = appliedRulesJson.trim();
            if (cleaned.startsWith("[")) cleaned = cleaned.substring(1);
            if (cleaned.endsWith("]")) cleaned = cleaned.substring(0, cleaned.length() - 1);
            if (cleaned.isBlank()) continue;

            for (String idStr : cleaned.split(",")) {
                try {
                    Long ruleId = Long.parseLong(idStr.trim());
                    TariffRule rule = ruleMap.get(ruleId);
                    if (rule == null) continue;

                    // Count actual rule type application (STANDARD, WEEKEND, HOLIDAY, SPECIAL)
                    appliedRuleTypeDist.merge(rule.getRuleType().name(), 1L, Long::sum);

                    // Extract pricing model from formula
                    String formula = rule.getPricingFormula();
                    if (formula != null) {
                        String model = "FIXED"; // PricingService default
                        if (formula.contains("\"model\"")) {
                            int idx = formula.indexOf("\"model\"");
                            int colonIdx = formula.indexOf(":", idx);
                            int startQuote = formula.indexOf("\"", colonIdx + 1);
                            int endQuote = formula.indexOf("\"", startQuote + 1);
                            if (startQuote >= 0 && endQuote > startQuote) {
                                model = formula.substring(startQuote + 1, endQuote);
                            }
                        }
                        appliedModelDist.merge(model, 1L, Long::sum);
                    }
                } catch (NumberFormatException e) { /* skip bad id */ }
            }
        }
        result.put("pricingModelDistribution", appliedModelDist);
        result.put("ruleApplicationFrequency", appliedRuleTypeDist);

        // Also keep definition-level model distribution for reference
        Map<String, Long> definedModelDist = new LinkedHashMap<>();
        for (TariffRule rule : allRules) {
            String formula = rule.getPricingFormula();
            if (formula != null) {
                String model = "FIXED"; // default like PricingService
                if (formula.contains("\"model\"")) {
                    int idx = formula.indexOf("\"model\"");
                    int colonIdx = formula.indexOf(":", idx);
                    int startQuote = formula.indexOf("\"", colonIdx + 1);
                    int endQuote = formula.indexOf("\"", startQuote + 1);
                    if (startQuote >= 0 && endQuote > startQuote) {
                        model = formula.substring(startQuote + 1, endQuote);
                    }
                }
                definedModelDist.merge(model, 1L, Long::sum);
            }
        }
        result.put("pricingModelDefinitions", definedModelDist);

        // Breakdown line types (informational — BASE_RATE, COEFFICIENT, DISCOUNT etc.)
        Map<String, Long> breakdownTypeDist = new LinkedHashMap<>();
        for (PricingRun run : paidRuns) {
            if (run.getBreakdowns() != null) {
                for (var breakdown : run.getBreakdowns()) {
                    String lineType = breakdown.getLineType() != null ? breakdown.getLineType().name() : "UNKNOWN";
                    breakdownTypeDist.merge(lineType, 1L, Long::sum);
                }
            }
        }
        result.put("breakdownTypeDistribution", breakdownTypeDist);

        // Avg rate per minute/hour
        double totalMinutes = paidRuns.stream()
                .filter(r -> r.getServiceStart() != null && r.getServiceEnd() != null)
                .mapToDouble(r -> ChronoUnit.MINUTES.between(r.getServiceStart(), r.getServiceEnd()))
                .sum();
        double totalAmount = paidRuns.stream()
                .mapToDouble(r -> r.getTotalAmount() != null ? r.getTotalAmount().doubleValue() : 0)
                .sum();

        result.put("avgRatePerMinute", totalMinutes > 0 ? round(totalAmount / totalMinutes) : 0);
        result.put("avgRatePerHour", totalMinutes > 0 ? round(totalAmount / totalMinutes * 60) : 0);

        // ─── Discount analytics (включая коэффициентные снижения) ───
        // 1) Явные скидки из PricingRun.discountAmount (DISCOUNT rules + ручные %)
        double explicitDiscount = paidRuns.stream()
                .mapToDouble(r -> r.getDiscountAmount() != null ? r.getDiscountAmount().doubleValue() : 0)
                .sum();

        // 2) Скрытые скидки: COEFFICIENT breakdowns с отрицательной суммой
        //    (PERCENT_DECREASE / FIXED_DECREASE через special date modifiers)
        double coefficientDiscount = 0;
        for (PricingRun run : paidRuns) {
            if (run.getBreakdowns() != null) {
                for (var bd : run.getBreakdowns()) {
                    if (bd.getLineType() == PricingBreakdown.LineType.COEFFICIENT
                            && bd.getAmount() != null
                            && bd.getAmount().signum() < 0) {
                        coefficientDiscount += bd.getAmount().abs().doubleValue();
                    }
                }
            }
        }

        double totalDiscount = explicitDiscount + coefficientDiscount;
        double totalRevenue = totalAmount; // totalAmount уже рассчитан выше
        double grossRevenue = totalRevenue + totalDiscount; // до скидок

        result.put("totalDiscounts", round(totalDiscount));
        result.put("discountPercentOfRevenue", grossRevenue > 0 ? round(totalDiscount / grossRevenue * 100) : 0);
        // Для прозрачности: раздельные суммы
        result.put("explicitDiscounts", round(explicitDiscount));
        result.put("coefficientDiscounts", round(coefficientDiscount));

        // ─── Free minutes: определения правил + фактическое использование ───
        long rulesWithFreeMinutes = allRules.stream()
                .filter(r -> r.getFreeMinutes() != null && r.getFreeMinutes() > 0)
                .count();
        result.put("rulesWithFreeMinutes", rulesWithFreeMinutes);

        // Считаем сколько PricingRun-ов фактически использовали freeMinutes
        // (PricingRun привязан к правилу, у которого freeMinutes > 0)
        long actualFreeMinutesUsage = 0;
        for (PricingRun run : paidRuns) {
            if (run.getBreakdowns() != null) {
                for (var bd : run.getBreakdowns()) {
                    if (bd.getTariffRule() != null
                            && bd.getTariffRule().getFreeMinutes() != null
                            && bd.getTariffRule().getFreeMinutes() > 0
                            && bd.getLineType() == PricingBreakdown.LineType.BASE_RATE) {
                        actualFreeMinutesUsage++;
                        break; // один раз на PricingRun
                    }
                }
            }
        }
        result.put("actualFreeMinutesUsage", actualFreeMinutesUsage);

        // Amount distribution
        Map<String, Long> amountDistribution = new LinkedHashMap<>();
        for (Booking b : paid) {
            double amt = amount(b);
            String bucket;
            if (amt == 0) bucket = "0";
            else if (amt <= 500) bucket = "1-500";
            else if (amt <= 1000) bucket = "501-1000";
            else if (amt <= 2000) bucket = "1001-2000";
            else if (amt <= 5000) bucket = "2001-5000";
            else bucket = "5001+";
            amountDistribution.merge(bucket, 1L, Long::sum);
        }
        result.put("amountDistribution", amountDistribution);

        // ─── Revenue per tariff per day ───
        Map<String, Map<String, Double>> revenuePerTariffPerDay = new LinkedHashMap<>();
        for (Booking b : paid) {
            if (b.getActivity() == null || b.getActivity().getTariffPlan() == null) continue;
            String planName = b.getActivity().getTariffPlan().getName();
            String day = b.getStartAt().toLocalDate().toString();
            revenuePerTariffPerDay.computeIfAbsent(planName, k -> new TreeMap<>())
                    .merge(day, amount(b), Double::sum);
        }
        result.put("revenuePerTariffPerDay", revenuePerTariffPerDay);

        // ─── Bookings per tariff per day ───
        Map<String, Map<String, Long>> bookingsPerTariffPerDay = new LinkedHashMap<>();
        for (Booking b : paid) {
            if (b.getActivity() == null || b.getActivity().getTariffPlan() == null) continue;
            String planName = b.getActivity().getTariffPlan().getName();
            String day = b.getStartAt().toLocalDate().toString();
            bookingsPerTariffPerDay.computeIfAbsent(planName, k -> new TreeMap<>())
                    .merge(day, 1L, Long::sum);
        }
        result.put("bookingsPerTariffPerDay", bookingsPerTariffPerDay);

        // ─── Revenue by day type: weekday / weekend / holiday ───
        Map<String, Double> revenueByDayType = new LinkedHashMap<>();
        revenueByDayType.put("WEEKDAY", 0.0);
        revenueByDayType.put("WEEKEND", 0.0);
        revenueByDayType.put("HOLIDAY", 0.0);
        Map<String, Long> bookingsByDayType = new LinkedHashMap<>();
        bookingsByDayType.put("WEEKDAY", 0L);
        bookingsByDayType.put("WEEKEND", 0L);
        bookingsByDayType.put("HOLIDAY", 0L);

        // Collect all special dates from all tariff plans
        Set<LocalDate> allSpecialDates = new HashSet<>();
        List<TariffPlan> activePlans = paid.stream()
                .filter(b -> b.getActivity() != null && b.getActivity().getTariffPlan() != null)
                .map(b -> b.getActivity().getTariffPlan())
                .distinct()
                .collect(Collectors.toList());
        for (TariffPlan plan : activePlans) {
            if (plan.getCalendar() != null && plan.getCalendar().getSpecialDates() != null) {
                allSpecialDates.addAll(plan.getCalendar().getSpecialDates());
            }
        }

        // Collect weekend days from calendar (weekendDays is a JSON string like "[\"SATURDAY\",\"SUNDAY\"]" or "SAT_SUN")
        Set<DayOfWeek> weekendDays = new HashSet<>();
        for (TariffPlan plan : activePlans) {
            if (plan.getCalendar() != null && plan.getCalendar().getWeekendDays() != null) {
                String wd = plan.getCalendar().getWeekendDays();
                // Handle predefined modes
                if ("SAT_SUN".equalsIgnoreCase(wd)) {
                    weekendDays.add(DayOfWeek.SATURDAY);
                    weekendDays.add(DayOfWeek.SUNDAY);
                } else if ("FRI_SAT".equalsIgnoreCase(wd)) {
                    weekendDays.add(DayOfWeek.FRIDAY);
                    weekendDays.add(DayOfWeek.SATURDAY);
                } else if ("SUN".equalsIgnoreCase(wd) || "SUNDAY".equalsIgnoreCase(wd)) {
                    weekendDays.add(DayOfWeek.SUNDAY);
                } else {
                    // Try parsing as JSON array or comma-separated
                    String cleaned = wd.replace("[", "").replace("]", "").replace("\"", "");
                    for (String part : cleaned.split(",")) {
                        try { weekendDays.add(DayOfWeek.valueOf(part.trim().toUpperCase())); } catch (Exception ignored) {}
                    }
                }
            }
        }
        if (weekendDays.isEmpty()) {
            weekendDays.add(DayOfWeek.SATURDAY);
            weekendDays.add(DayOfWeek.SUNDAY);
        }

        for (Booking b : paid) {
            LocalDate bDate = b.getStartAt().toLocalDate();
            double amt = amount(b);
            if (allSpecialDates.contains(bDate)) {
                revenueByDayType.merge("HOLIDAY", amt, Double::sum);
                bookingsByDayType.merge("HOLIDAY", 1L, Long::sum);
            } else if (weekendDays.contains(bDate.getDayOfWeek())) {
                revenueByDayType.merge("WEEKEND", amt, Double::sum);
                bookingsByDayType.merge("WEEKEND", 1L, Long::sum);
            } else {
                revenueByDayType.merge("WEEKDAY", amt, Double::sum);
                bookingsByDayType.merge("WEEKDAY", 1L, Long::sum);
            }
        }
        result.put("revenueByDayType", revenueByDayType);
        result.put("bookingsByDayType", bookingsByDayType);

        // ─── Avg check by day type ───
        Map<String, Double> avgCheckByDayType = new LinkedHashMap<>();
        for (String type : List.of("WEEKDAY", "WEEKEND", "HOLIDAY")) {
            long count = bookingsByDayType.getOrDefault(type, 0L);
            double rev = revenueByDayType.getOrDefault(type, 0.0);
            avgCheckByDayType.put(type, count > 0 ? round(rev / count) : 0.0);
        }
        result.put("avgCheckByDayType", avgCheckByDayType);

        // ─── Revenue per tariff by day type ───
        Map<String, Map<String, Double>> revenuePerTariffByDayType = new LinkedHashMap<>();
        for (Booking b : paid) {
            if (b.getActivity() == null || b.getActivity().getTariffPlan() == null) continue;
            String planName = b.getActivity().getTariffPlan().getName();
            LocalDate bDate = b.getStartAt().toLocalDate();
            String dayType;
            if (allSpecialDates.contains(bDate)) dayType = "HOLIDAY";
            else if (weekendDays.contains(bDate.getDayOfWeek())) dayType = "WEEKEND";
            else dayType = "WEEKDAY";
            revenuePerTariffByDayType.computeIfAbsent(planName, k -> new LinkedHashMap<>())
                    .merge(dayType, amount(b), Double::sum);
        }
        result.put("revenuePerTariffByDayType", revenuePerTariffByDayType);

        return result;
    }

    // ═══════════════ 7. NOTIFICATION ANALYTICS ═══════════════

    @Transactional(readOnly = true)
    public Map<String, Object> getNotificationAnalytics(LocalDate from, LocalDate to, Long restaurantId) {
        Long rid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();

        List<BookingNotification> allNotifications = notificationRepository.findAll().stream()
                .filter(n -> rid == null || n.getRestaurantId().equals(rid))
                .filter(n -> {
                    LocalDateTime created = n.getCreatedAt();
                    return !created.isBefore(startOf(from)) && !created.isAfter(endOf(to));
                })
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();

        // By type
        Map<String, Long> byType = allNotifications.stream()
                .collect(Collectors.groupingBy(n -> n.getNotificationType().name(), Collectors.counting()));
        result.put("byType", byType);

        // Total
        result.put("total", allNotifications.size());
        result.put("pending", allNotifications.stream().filter(n -> n.getStatus() == BookingNotification.NotificationStatus.PENDING).count());
        result.put("resolved", allNotifications.stream().filter(n -> n.getStatus() == BookingNotification.NotificationStatus.RESOLVED).count());

        // Average reaction time (for resolved)
        List<BookingNotification> resolved = allNotifications.stream()
                .filter(n -> n.getStatus() == BookingNotification.NotificationStatus.RESOLVED)
                .filter(n -> n.getResolvedAt() != null)
                .collect(Collectors.toList());

        double avgReactionMinutes = resolved.stream()
                .mapToDouble(n -> ChronoUnit.MINUTES.between(n.getCreatedAt(), n.getResolvedAt()))
                .average().orElse(0);
        result.put("avgReactionMinutes", round(avgReactionMinutes));

        // REMINDER → CONFIRMED conversion
        List<BookingNotification> reminders = allNotifications.stream()
                .filter(n -> n.getNotificationType() == BookingNotification.NotificationType.REMINDER)
                .collect(Collectors.toList());
        long reminderConfirmed = reminders.stream()
                .filter(n -> n.getResponse() == BookingNotification.NotificationResponse.CONFIRMED)
                .count();
        result.put("reminderTotal", reminders.size());
        result.put("reminderConfirmed", reminderConfirmed);
        result.put("reminderConfirmedPct", reminders.isEmpty() ? 0 :
                round((double) reminderConfirmed / reminders.size() * 100));

        // OVERDUE → PAID conversion
        List<BookingNotification> overdues = allNotifications.stream()
                .filter(n -> n.getNotificationType() == BookingNotification.NotificationType.OVERDUE)
                .collect(Collectors.toList());
        long overduePaid = overdues.stream()
                .filter(n -> n.getResponse() == BookingNotification.NotificationResponse.PAID_OR_CANCELLED)
                .count();
        result.put("overdueTotal", overdues.size());
        result.put("overduePaid", overduePaid);
        result.put("overduePaidPct", overdues.isEmpty() ? 0 :
                round((double) overduePaid / overdues.size() * 100));

        // GAP ignored %
        List<BookingNotification> gaps = allNotifications.stream()
                .filter(n -> n.getNotificationType() == BookingNotification.NotificationType.GAP)
                .collect(Collectors.toList());
        long gapIgnored = gaps.stream()
                .filter(n -> n.getStatus() == BookingNotification.NotificationStatus.PENDING)
                .count(); // Still pending = effectively ignored
        result.put("gapTotal", gaps.size());
        result.put("gapIgnored", gapIgnored);
        result.put("gapIgnoredPct", gaps.isEmpty() ? 0 :
                round((double) gapIgnored / gaps.size() * 100));

        // Avg OVERDUE per client
        Map<String, Long> overdueByClient = overdues.stream()
                .filter(n -> n.getBooking() != null && n.getBooking().getCustomerName() != null)
                .collect(Collectors.groupingBy(n -> n.getBooking().getCustomerName(), Collectors.counting()));
        double avgOverduePerClient = overdueByClient.isEmpty() ? 0 :
                overdueByClient.values().stream().mapToLong(Long::longValue).average().orElse(0);
        result.put("avgOverduePerClient", round(avgOverduePerClient));
        result.put("overdueByClient", overdueByClient);

        return result;
    }

    // ═══════════════ HEATMAP: hour × day ═══════════════

    private Map<String, Object> getHeatmapData(LocalDate from, LocalDate to, Long restaurantId) {
        List<Booking> bookings = allBookings(restaurantId, startOf(from), endOf(to));
        List<Booking> paid = bookings.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .collect(Collectors.toList());

        // Bookings count heatmap: day-of-week × hour
        Map<String, Map<String, Integer>> countHeatmap = new LinkedHashMap<>();
        Map<String, Map<String, Double>> revenueHeatmap = new LinkedHashMap<>();
        String[] dows = {"MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"};
        for (String dow : dows) {
            countHeatmap.put(dow, new LinkedHashMap<>());
            revenueHeatmap.put(dow, new LinkedHashMap<>());
            for (int h = 0; h < 24; h++) {
                countHeatmap.get(dow).put(String.valueOf(h), 0);
                revenueHeatmap.get(dow).put(String.valueOf(h), 0.0);
            }
        }

        for (Booking b : paid) {
            String dow = b.getStartAt().getDayOfWeek().name();
            String hour = String.valueOf(b.getStartAt().getHour());
            countHeatmap.get(dow).merge(hour, 1, Integer::sum);
            revenueHeatmap.get(dow).merge(hour, amount(b), Double::sum);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("bookings", countHeatmap);
        result.put("revenue", revenueHeatmap);
        return result;
    }

    // ═══════════════ TRENDS (vs previous period) ═══════════════

    private Map<String, Object> getTrends(LocalDate from, LocalDate to, Long restaurantId) {
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        LocalDate prevTo = from.minusDays(1);
        LocalDate prevFrom = prevTo.minusDays(days - 1);

        List<Booking> current = allBookings(restaurantId, startOf(from), endOf(to));
        List<Booking> previous = allBookings(restaurantId, startOf(prevFrom), endOf(prevTo));

        // Current metrics
        long curTotal = current.size();
        long curPaid = current.stream().filter(b -> b.getStatus() == Booking.BookingStatus.PAID).count();
        long curCancelled = current.stream().filter(b -> b.getStatus() == Booking.BookingStatus.CANCELLED).count();
        double curRevenue = current.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .mapToDouble(this::amount).sum();
        double curAvgCheck = curPaid > 0 ? curRevenue / curPaid : 0;
        double curCancelRate = curTotal > 0 ? (double) curCancelled / curTotal * 100 : 0;

        // Previous metrics
        long prevTotal = previous.size();
        long prevPaid = previous.stream().filter(b -> b.getStatus() == Booking.BookingStatus.PAID).count();
        long prevCancelled = previous.stream().filter(b -> b.getStatus() == Booking.BookingStatus.CANCELLED).count();
        double prevRevenue = previous.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .mapToDouble(this::amount).sum();
        double prevAvgCheck = prevPaid > 0 ? prevRevenue / prevPaid : 0;
        double prevCancelRate = prevTotal > 0 ? (double) prevCancelled / prevTotal * 100 : 0;

        // Calculate deltas
        Map<String, Object> trends = new LinkedHashMap<>();
        trends.put("totalDelta", prevTotal > 0 ? round((double)(curTotal - prevTotal) / prevTotal * 100) : null);
        trends.put("revenueDelta", prevRevenue > 0 ? round((curRevenue - prevRevenue) / prevRevenue * 100) : null);
        trends.put("avgCheckDelta", prevAvgCheck > 0 ? round((curAvgCheck - prevAvgCheck) / prevAvgCheck * 100) : null);
        trends.put("cancelRateDelta", round(curCancelRate - prevCancelRate));
        trends.put("paidDelta", prevPaid > 0 ? round((double)(curPaid - prevPaid) / prevPaid * 100) : null);

        // Sparkline data: daily revenue for current period
        Map<String, Double> dailyRevenue = new TreeMap<>();
        Map<String, Integer> dailyCounts = new TreeMap<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            dailyRevenue.put(d.toString(), 0.0);
            dailyCounts.put(d.toString(), 0);
        }
        for (Booking b : current) {
            if (b.getStatus() == Booking.BookingStatus.PAID) {
                String key = b.getStartAt().toLocalDate().toString();
                dailyRevenue.merge(key, amount(b), Double::sum);
            }
            String key = b.getStartAt().toLocalDate().toString();
            dailyCounts.merge(key, 1, Integer::sum);
        }
        trends.put("dailyRevenue", dailyRevenue);
        trends.put("dailyCounts", dailyCounts);

        // Previous period values for display
        trends.put("prevRevenue", round(prevRevenue));
        trends.put("prevTotal", prevTotal);
        trends.put("prevAvgCheck", round(prevAvgCheck));
        trends.put("prevCancelRate", round(prevCancelRate));

        return trends;
    }

    // ═══════════════ INSIGHTS (auto-generated alerts) ═══════════════

    private List<Map<String, String>> getInsights(Map<String, Object> dashboard) {
        List<Map<String, String>> insights = new ArrayList<>();

        // Check cancel rate
        @SuppressWarnings("unchecked")
        Map<String, Object> conversion = (Map<String, Object>) dashboard.get("conversion");
        if (conversion != null) {
            Object cr = conversion.get("cancelRate");
            if (cr instanceof Number && ((Number) cr).doubleValue() > 30) {
                insights.add(Map.of(
                    "level", "critical",
                    "icon", "🔥",
                    "tab", "conversion",
                    "title", "Высокий % отмен",
                    "text", String.format("%.0f%% бронирований отменяется. Это критично для бизнеса.", ((Number) cr).doubleValue())
                ));
            }
        }

        // Check idle coefficient
        @SuppressWarnings("unchecked")
        Map<String, Object> capacity = (Map<String, Object>) dashboard.get("capacity");
        if (capacity != null) {
            Object idle = capacity.get("idleCoefficient");
            if (idle instanceof Number && ((Number) idle).doubleValue() > 50) {
                insights.add(Map.of(
                    "level", "warning",
                    "icon", "⚠️",
                    "tab", "capacity",
                    "title", "Высокий простой",
                    "text", String.format("%.0f%% рабочего времени не используется.", ((Number) idle).doubleValue())
                ));
            }
        }

        // Check stop-check lost revenue
        @SuppressWarnings("unchecked")
        Map<String, Object> stopCheck = (Map<String, Object>) dashboard.get("stopCheck");
        if (stopCheck != null) {
            Object lost = stopCheck.get("lostRevenueDueToStopCheck");
            if (lost instanceof Number && ((Number) lost).doubleValue() > 1000) {
                insights.add(Map.of(
                    "level", "info",
                    "icon", "💡",
                    "tab", "stopCheck",
                    "title", "Стоп-чек: экономия клиентов",
                    "text", String.format("₽%.0f — сумма, которую клиенты сэкономили благодаря стоп-чеку.", ((Number) lost).doubleValue())
                ));
            }
        }

        // Check low retention
        if (conversion != null) {
            Object ret = conversion.get("retentionRate");
            if (ret instanceof Number && ((Number) ret).doubleValue() < 20) {
                insights.add(Map.of(
                    "level", "warning",
                    "icon", "📉",
                    "tab", "conversion",
                    "title", "Низкий Retention",
                    "text", String.format("Только %.0f%% клиентов возвращаются. Рассмотрите программу лояльности.", ((Number) ret).doubleValue())
                ));
            }
        }

        // Positive insight: growth
        @SuppressWarnings("unchecked")
        Map<String, Object> trends = (Map<String, Object>) dashboard.get("trends");
        if (trends != null) {
            Object rd = trends.get("revenueDelta");
            if (rd instanceof Number && ((Number) rd).doubleValue() > 10) {
                insights.add(Map.of(
                    "level", "success",
                    "icon", "📈",
                    "tab", "revenue",
                    "title", "Рост выручки",
                    "text", String.format("+%.0f%% выручки по сравнению с прошлым периодом!", ((Number) rd).doubleValue())
                ));
            }
        }

        return insights;
    }

    // ═══════════════ ENTERPRISE: RFM Segmentation ═══════════════

    @SuppressWarnings("unchecked")
    private Map<String, Object> getRfmSegmentation(LocalDate from, LocalDate to, Long restaurantId) {
        List<Booking> all = allBookings(restaurantId, startOf(from), endOf(to));
        List<Booking> paid = all.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .collect(Collectors.toList());
        Map<String, Object> result = new LinkedHashMap<>();
        if (paid.isEmpty()) {
            result.put("segments", Collections.emptyMap());
            result.put("clients", Collections.emptyList());
            return result;
        }

        LocalDate refDate = to != null ? to : LocalDate.now();
        Map<String, List<Booking>> byClient = paid.stream()
                .filter(b -> b.getCustomerName() != null && !b.getCustomerName().isBlank())
                .collect(Collectors.groupingBy(this::clientKey));

        List<Map<String, Object>> clientRfm = new ArrayList<>();
        for (var entry : byClient.entrySet()) {
            List<Booking> bookings = entry.getValue();
            LocalDate lastVisit = bookings.stream()
                    .map(b -> b.getStartAt().toLocalDate())
                    .max(LocalDate::compareTo).orElse(refDate);
            long recency = ChronoUnit.DAYS.between(lastVisit, refDate);
            int frequency = bookings.size();
            double monetary = bookings.stream().mapToDouble(this::amount).sum();

            Map<String, Object> c = new LinkedHashMap<>();
            c.put("client", entry.getKey());
            c.put("recency", recency);
            c.put("frequency", frequency);
            c.put("monetary", round(monetary));
            // Score 1-5 (will be computed relative to dataset)
            clientRfm.add(c);
        }

        // Compute percentile-based scores (1-5)
        List<Long> recencies = clientRfm.stream().map(c -> (Long) c.get("recency")).sorted().collect(Collectors.toList());
        List<Integer> frequencies = clientRfm.stream().map(c -> (Integer) c.get("frequency")).sorted().collect(Collectors.toList());
        List<Double> monetaries = clientRfm.stream().map(c -> (Double) c.get("monetary")).sorted().collect(Collectors.toList());

        for (var c : clientRfm) {
            int rScore = 5 - Math.min(4, (int) (percentileRank(recencies, (Long) c.get("recency")) * 5));
            int fScore = 1 + Math.min(4, (int) (percentileRank(frequencies, (Integer) c.get("frequency")) * 5));
            int mScore = 1 + Math.min(4, (int) (percentileRank(monetaries, (Double) c.get("monetary")) * 5));
            c.put("rScore", rScore);
            c.put("fScore", fScore);
            c.put("mScore", mScore);
            c.put("segment", rfmSegment(rScore, fScore, mScore));
        }

        // Segment distribution
        Map<String, Long> segments = clientRfm.stream()
                .collect(Collectors.groupingBy(c -> (String) c.get("segment"), Collectors.counting()));
        result.put("segments", segments);

        // Top clients by RFM
        clientRfm.sort((a, b) -> Double.compare((Double) b.get("monetary"), (Double) a.get("monetary")));
        result.put("clients", clientRfm.size() > 50 ? clientRfm.subList(0, 50) : clientRfm);
        result.put("totalClients", clientRfm.size());

        return result;
    }

    private <T extends Comparable<T>> double percentileRank(List<T> sorted, T value) {
        int idx = Collections.binarySearch(sorted, value);
        if (idx < 0) idx = -idx - 1;
        return sorted.isEmpty() ? 0 : (double) idx / sorted.size();
    }

    private String rfmSegment(int r, int f, int m) {
        double avg = (r + f + m) / 3.0;
        if (r >= 4 && f >= 4 && m >= 4) return "Champions";
        if (r >= 3 && f >= 3 && m >= 3) return "Loyal";
        if (r >= 4 && f <= 2) return "New Customers";
        if (r <= 2 && f >= 3) return "At Risk";
        if (r <= 2 && f <= 2 && m <= 2) return "Lost";
        if (f >= 3 && m >= 3) return "Big Spenders";
        if (avg >= 3) return "Potential";
        return "Hibernating";
    }

    // ═══════════════ ENTERPRISE: Cohort Retention ═══════════════

    private Map<String, Object> getCohortRetention(LocalDate from, LocalDate to, Long restaurantId) {
        // Use wider window for cohort analysis
        LocalDate cohortStart = from != null ? from.minusMonths(6) : LocalDate.now().minusMonths(12);
        List<Booking> all = allBookings(restaurantId, startOf(cohortStart), endOf(to));
        List<Booking> paid = all.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID && b.getCustomerName() != null)
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        if (paid.isEmpty()) return result;

        // Use phone as primary key for more robust matching
        Map<String, List<Booking>> byClient = paid.stream()
                .filter(b -> b.getCustomerPhone() != null && !b.getCustomerPhone().isBlank())
                .collect(Collectors.groupingBy(b -> b.getCustomerPhone().trim()));

        // ── Monthly cohort retention ──
        Map<String, Map<Integer, Set<String>>> cohorts = new TreeMap<>();
        for (var entry : byClient.entrySet()) {
            String firstMonth = entry.getValue().stream()
                    .map(b -> b.getStartAt().toLocalDate())
                    .min(LocalDate::compareTo)
                    .map(d -> d.getYear() + "-" + String.format("%02d", d.getMonthValue()))
                    .orElse("");
            if (firstMonth.isEmpty()) continue;

            YearMonth cohortYm = YearMonth.parse(firstMonth);
            for (Booking b : entry.getValue()) {
                YearMonth bookingYm = YearMonth.from(b.getStartAt().toLocalDate());
                int monthOffset = (int) ChronoUnit.MONTHS.between(cohortYm, bookingYm);
                cohorts.computeIfAbsent(firstMonth, k -> new TreeMap<>())
                        .computeIfAbsent(monthOffset, k -> new HashSet<>())
                        .add(entry.getKey());
            }
        }

        // Reference date for "current" period (future months/weeks = null).
        // Use at least "today" so we never mark past weeks as "future" (—).
        // If user selects a period ending in the past, we still show 0% or value for past weeks.
        LocalDate now = LocalDate.now();
        LocalDate refDate = (to != null && to.isBefore(now)) ? now : (to != null ? to : now);
        YearMonth refYm = YearMonth.from(refDate);

        Map<String, List<Double>> matrix = new LinkedHashMap<>();
        Map<String, Integer> cohortSizes = new LinkedHashMap<>();
        for (var entry : cohorts.entrySet()) {
            int size = entry.getValue().getOrDefault(0, Collections.emptySet()).size();
            if (size == 0) continue;
            cohortSizes.put(entry.getKey(), size);
            YearMonth cohortYm = YearMonth.parse(entry.getKey());
            int currentMonthIndex = (int) ChronoUnit.MONTHS.between(cohortYm, refYm);
            currentMonthIndex = Math.max(0, currentMonthIndex); // cohort after ref → at least M0 shown
            List<Double> retention = new ArrayList<>();
            for (int m = 0; m <= 11; m++) {
                if (m > currentMonthIndex) {
                    retention.add(null);
                } else {
                    int active = entry.getValue().getOrDefault(m, Collections.emptySet()).size();
                    retention.add(round((double) active / size * 100));
                }
            }
            matrix.put(entry.getKey(), retention);
        }
        result.put("matrix", matrix);
        result.put("cohortSizes", cohortSizes);

        // ── Weekly cohort retention (same as monthly: first-ever in window, ISO week = Monday) ──
        // Week boundary: Monday 00:00. startAt is LocalDateTime (no TZ in DB); week_start uses same
        // calendar for cohort and activity → deterministic week_index = WEEKS.between(cohort_week_start, activity_week_start).
        Map<String, Map<Integer, Set<String>>> weeklyCohorts = new TreeMap<>();
        for (var entry : byClient.entrySet()) {
            LocalDate firstDate = entry.getValue().stream()
                    .map(b -> b.getStartAt().toLocalDate())
                    .min(LocalDate::compareTo).orElse(null);
            if (firstDate == null) continue;
            LocalDate weekStart = firstDate.with(java.time.DayOfWeek.MONDAY);
            String weekLabel = weekStart.toString();

            for (Booking b : entry.getValue()) {
                LocalDate bDate = b.getStartAt().toLocalDate();
                LocalDate bWeekStart = bDate.with(java.time.DayOfWeek.MONDAY);
                long weeksBetween = ChronoUnit.WEEKS.between(weekStart, bWeekStart);
                if (weeksBetween < 0 || weeksBetween > 12) continue;
                int weekOffset = (int) weeksBetween;
                weeklyCohorts.computeIfAbsent(weekLabel, k -> new TreeMap<>())
                        .computeIfAbsent(weekOffset, k -> new HashSet<>())
                        .add(entry.getKey());
            }
        }

        LocalDate refWeekStart = refDate.with(java.time.DayOfWeek.MONDAY);
        Map<String, List<Double>> weeklyMatrix = new LinkedHashMap<>();
        Map<String, Integer> weeklySizes = new LinkedHashMap<>();
        final int maxWeeklyColumns = 13; // W0..W12
        for (var entry : weeklyCohorts.entrySet()) {
            int size = entry.getValue().getOrDefault(0, Collections.emptySet()).size();
            if (size == 0) continue;
            weeklySizes.put(entry.getKey(), size);
            LocalDate cohortWeekStart = LocalDate.parse(entry.getKey());
            int currentWeekIndex = (int) ChronoUnit.WEEKS.between(cohortWeekStart, refWeekStart);
            currentWeekIndex = Math.max(0, currentWeekIndex); // cohort after ref → at least W0 shown, W1+ "—"
            List<Double> retention = new ArrayList<>();
            for (int w = 0; w < maxWeeklyColumns; w++) {
                if (w > currentWeekIndex) {
                    retention.add(null);
                } else {
                    int active = entry.getValue().getOrDefault(w, Collections.emptySet()).size();
                    retention.add(round((double) active / size * 100));
                }
            }
            weeklyMatrix.put(entry.getKey(), retention);
        }
        result.put("weeklyMatrix", weeklyMatrix);
        result.put("weeklySizes", weeklySizes);

        return result;
    }

    // ═══════════════ ENTERPRISE: Unit Economics ═══════════════

    private Map<String, Object> getUnitEconomics(LocalDate from, LocalDate to, Long restaurantId) {
        List<Booking> all = allBookings(restaurantId, startOf(from), endOf(to));
        List<Booking> paid = all.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .collect(Collectors.toList());
        Map<String, Object> result = new LinkedHashMap<>();

        double totalRevenue = paid.stream().mapToDouble(this::amount).sum();
        double totalHours = paid.stream().mapToDouble(b -> minutes(b) / 60.0).sum();
        long uniqueClients = paid.stream()
                .filter(b -> b.getCustomerName() != null)
                .map(this::clientKey).distinct().count();
        long totalBookings = paid.size();

        result.put("revenuePerHour", totalHours > 0 ? round(totalRevenue / totalHours) : 0);
        result.put("revenuePerBooking", totalBookings > 0 ? round(totalRevenue / totalBookings) : 0);
        result.put("revenuePerClient", uniqueClients > 0 ? round(totalRevenue / uniqueClients) : 0);
        result.put("bookingsPerClient", uniqueClients > 0 ? round((double) totalBookings / uniqueClients) : 0);
        result.put("avgSessionHours", totalBookings > 0 ? round(totalHours / totalBookings) : 0);
        result.put("totalHours", round(totalHours));
        result.put("totalRevenue", round(totalRevenue));

        // RevPAH (Revenue Per Available Hour) by activity
        Map<String, Object> revpah = new LinkedHashMap<>();
        Map<String, List<Booking>> byActivity = paid.stream()
                .filter(b -> b.getActivity() != null)
                .collect(Collectors.groupingBy(b -> b.getActivity().getName()));
        for (var entry : byActivity.entrySet()) {
            double actRev = entry.getValue().stream().mapToDouble(this::amount).sum();
            double actHrs = entry.getValue().stream().mapToDouble(b -> minutes(b) / 60.0).sum();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("revenue", round(actRev));
            m.put("hours", round(actHrs));
            m.put("revpah", actHrs > 0 ? round(actRev / actHrs) : 0);
            m.put("bookings", entry.getValue().size());
            revpah.put(entry.getKey(), m);
        }
        result.put("byActivity", revpah);

        return result;
    }

    // ═══════════════ ENTERPRISE: Forecast (Seasonal EWMA + Trend) ═══════════════

    private Map<String, Object> getForecast(LocalDate from, LocalDate to, Long restaurantId) {
        // Pull 90 extra historical days for robust seasonality estimation
        LocalDate extFrom = from.minusDays(90);
        List<Booking> allExtended = allBookings(restaurantId, startOf(extFrom), endOf(to));
        List<Booking> paidExt = allExtended.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();

        // Daily revenue series (extended window)
        Map<String, Double> dailyRevenue = new TreeMap<>();
        for (LocalDate d = extFrom; !d.isAfter(to); d = d.plusDays(1)) {
            dailyRevenue.put(d.toString(), 0.0);
        }
        for (Booking b : paidExt) {
            String key = b.getStartAt().toLocalDate().toString();
            dailyRevenue.merge(key, amount(b), Double::sum);
        }

        List<String> dates = new ArrayList<>(dailyRevenue.keySet());
        List<Double> values = dates.stream().map(dailyRevenue::get).collect(Collectors.toList());
        int n = values.size();
        if (n < 14) {
            result.put("forecastRevenue", Collections.emptyMap());
            result.put("forecastBookings", Collections.emptyMap());
            result.put("trend", "insufficient_data");
            return result;
        }

        // ── Step 1: Day-of-week seasonal indices ──
        double globalMean = values.stream().mapToDouble(d -> d).average().orElse(1);
        Map<Integer, List<Double>> byDow = new HashMap<>();
        for (int i = 0; i < n; i++) {
            int dow = LocalDate.parse(dates.get(i)).getDayOfWeek().getValue(); // 1=Mon..7=Sun
            byDow.computeIfAbsent(dow, k -> new ArrayList<>()).add(values.get(i));
        }
        Map<Integer, Double> seasonIdx = new HashMap<>();
        for (int dow = 1; dow <= 7; dow++) {
            List<Double> vals = byDow.getOrDefault(dow, List.of(globalMean));
            double dowMean = vals.stream().mapToDouble(d -> d).average().orElse(globalMean);
            seasonIdx.put(dow, globalMean > 0 ? dowMean / globalMean : 1.0);
        }

        // ── Step 2: Deseasonalize ──
        double[] deseason = new double[n];
        for (int i = 0; i < n; i++) {
            int dow = LocalDate.parse(dates.get(i)).getDayOfWeek().getValue();
            double si = seasonIdx.getOrDefault(dow, 1.0);
            deseason[i] = si > 0 ? values.get(i) / si : values.get(i);
        }

        // ── Step 3: EWMA for smoothed trend ──
        double alpha = 0.12;
        double[] ewma = new double[n];
        ewma[0] = deseason[0];
        for (int i = 1; i < n; i++) {
            ewma[i] = alpha * deseason[i] + (1 - alpha) * ewma[i - 1];
        }

        // ── Step 4: Linear trend on last 30 EWMA points ──
        int tw = Math.min(30, n);
        int off = n - tw;
        double sX = 0, sY = 0, sXY = 0, sX2 = 0;
        for (int i = 0; i < tw; i++) {
            sX += i; sY += ewma[off + i];
            sXY += i * ewma[off + i]; sX2 += (double) i * i;
        }
        double denom = tw * sX2 - sX * sX;
        double trendSlope = denom != 0 ? (tw * sXY - sX * sY) / denom : 0;
        double trendBase = ewma[n - 1]; // anchor from last EWMA value

        // ── Step 5: Prediction error (for confidence band) ──
        double sumSqErr = 0;
        for (int i = 0; i < tw; i++) {
            double predicted = ewma[off] + trendSlope * i;
            double err = deseason[off + i] - predicted;
            sumSqErr += err * err;
        }
        double stdErr = Math.sqrt(sumSqErr / Math.max(1, tw - 2));

        // ── Step 6: Generate 14-day forecast with confidence intervals ──
        Map<String, Double> forecastRevenue = new LinkedHashMap<>();
        Map<String, Double> forecastUpper = new LinkedHashMap<>();
        Map<String, Double> forecastLower = new LinkedHashMap<>();
        for (int i = 1; i <= 14; i++) {
            LocalDate fd = to.plusDays(i);
            int dow = fd.getDayOfWeek().getValue();
            double si = seasonIdx.getOrDefault(dow, 1.0);
            double trendVal = trendBase + trendSlope * i;
            double predicted = Math.max(0, trendVal * si);
            double margin = 1.96 * stdErr * si * Math.sqrt(1.0 + (double) i / tw);
            forecastRevenue.put(fd.toString(), round(predicted));
            forecastUpper.put(fd.toString(), round(predicted + margin));
            forecastLower.put(fd.toString(), round(Math.max(0, predicted - margin)));
        }
        result.put("forecastRevenue", forecastRevenue);
        result.put("forecastUpper", forecastUpper);
        result.put("forecastLower", forecastLower);

        // ── Booking count forecast (same approach) ──
        Map<String, Integer> dailyCounts = new TreeMap<>();
        for (LocalDate d = extFrom; !d.isAfter(to); d = d.plusDays(1)) {
            dailyCounts.put(d.toString(), 0);
        }
        for (Booking bk : allExtended) {
            String key = bk.getStartAt().toLocalDate().toString();
            dailyCounts.merge(key, 1, Integer::sum);
        }
        List<Double> cntVals = new ArrayList<>(dailyCounts.values()).stream()
                .map(Integer::doubleValue).collect(Collectors.toList());
        double cntMean = cntVals.stream().mapToDouble(d -> d).average().orElse(1);
        Map<Integer, Double> cntSeason = new HashMap<>();
        for (int dow = 1; dow <= 7; dow++) {
            List<Double> dowCnts = new ArrayList<>();
            for (int i = 0; i < cntVals.size(); i++) {
                if (LocalDate.parse(dates.get(i)).getDayOfWeek().getValue() == dow) dowCnts.add(cntVals.get(i));
            }
            double dm = dowCnts.isEmpty() ? cntMean : dowCnts.stream().mapToDouble(d -> d).average().orElse(cntMean);
            cntSeason.put(dow, cntMean > 0 ? dm / cntMean : 1.0);
        }
        double[] cntEwma = new double[n];
        cntEwma[0] = cntVals.get(0) / cntSeason.getOrDefault(LocalDate.parse(dates.get(0)).getDayOfWeek().getValue(), 1.0);
        for (int i = 1; i < n; i++) {
            int dw = LocalDate.parse(dates.get(i)).getDayOfWeek().getValue();
            double dv = cntSeason.getOrDefault(dw, 1.0);
            double ds = dv > 0 ? cntVals.get(i) / dv : cntVals.get(i);
            cntEwma[i] = alpha * ds + (1 - alpha) * cntEwma[i - 1];
        }
        double cntBase = cntEwma[n - 1];
        Map<String, Double> forecastBookings = new LinkedHashMap<>();
        for (int i = 1; i <= 14; i++) {
            LocalDate fd = to.plusDays(i);
            int dow = fd.getDayOfWeek().getValue();
            double si = cntSeason.getOrDefault(dow, 1.0);
            forecastBookings.put(fd.toString(), round(Math.max(0, cntBase * si)));
        }
        result.put("forecastBookings", forecastBookings);

        // ── Trend & summary ──
        double relSlope = globalMean > 0 ? (trendSlope / globalMean) * 100 : 0;
        result.put("trend", relSlope > 1 ? "growing" : relSlope < -1 ? "declining" : "stable");
        result.put("slope", round(trendSlope));
        result.put("relativeSlope", round(relSlope));
        result.put("avgDailyRevenue", round(globalMean));
        result.put("projectedMonthlyRevenue", round(Math.max(0, trendBase * 30)));
        result.put("seasonalIndex", seasonIdx);

        return result;
    }

    // ═══════════════ ENTERPRISE: Anomaly Detection (z-score) ═══════════════

    private List<Map<String, Object>> getAnomalies(LocalDate from, LocalDate to, Long restaurantId) {
        List<Booking> all = allBookings(restaurantId, startOf(from), endOf(to));
        List<Map<String, Object>> anomalies = new ArrayList<>();

        // Daily revenue
        Map<String, Double> dailyRevenue = new TreeMap<>();
        Map<String, Integer> dailyCounts = new TreeMap<>();
        for (LocalDate d = from; d != null && !d.isAfter(to); d = d.plusDays(1)) {
            dailyRevenue.put(d.toString(), 0.0);
            dailyCounts.put(d.toString(), 0);
        }
        for (Booking b : all) {
            String key = b.getStartAt().toLocalDate().toString();
            if (b.getStatus() == Booking.BookingStatus.PAID) {
                dailyRevenue.merge(key, amount(b), Double::sum);
            }
            dailyCounts.merge(key, 1, Integer::sum);
        }

        // Detect revenue anomalies
        detectZScoreAnomalies(dailyRevenue, "revenue", anomalies);
        // Detect volume anomalies
        Map<String, Double> countDoubles = new TreeMap<>();
        dailyCounts.forEach((k, v) -> countDoubles.put(k, v.doubleValue()));
        detectZScoreAnomalies(countDoubles, "bookings", anomalies);

        // Detect cancel rate spikes
        Map<String, Double> dailyCancelRate = new TreeMap<>();
        Map<String, Long> dailyTotal = all.stream()
                .collect(Collectors.groupingBy(b -> b.getStartAt().toLocalDate().toString(), Collectors.counting()));
        Map<String, Long> dailyCancelled = all.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.CANCELLED)
                .collect(Collectors.groupingBy(b -> b.getStartAt().toLocalDate().toString(), Collectors.counting()));
        for (var entry : dailyTotal.entrySet()) {
            long cancelled = dailyCancelled.getOrDefault(entry.getKey(), 0L);
            dailyCancelRate.put(entry.getKey(), entry.getValue() > 0 ? (double) cancelled / entry.getValue() * 100 : 0);
        }
        detectZScoreAnomalies(dailyCancelRate, "cancelRate", anomalies);

        return anomalies;
    }

    private void detectZScoreAnomalies(Map<String, Double> series, String metricName, List<Map<String, Object>> out) {
        if (series.size() < 7) return;
        double[] values = series.values().stream().mapToDouble(d -> d).toArray();
        double mean = Arrays.stream(values).average().orElse(0);
        double variance = Arrays.stream(values).map(v -> (v - mean) * (v - mean)).average().orElse(0);
        double std = Math.sqrt(variance);
        if (std < 0.001) return;

        for (var entry : series.entrySet()) {
            double z = (entry.getValue() - mean) / std;
            if (Math.abs(z) > 2.0) {
                Map<String, Object> a = new LinkedHashMap<>();
                a.put("date", entry.getKey());
                a.put("metric", metricName);
                a.put("value", round(entry.getValue()));
                a.put("zScore", round(z));
                a.put("mean", round(mean));
                a.put("severity", Math.abs(z) > 3 ? "critical" : "warning");
                a.put("direction", z > 0 ? "spike" : "drop");
                out.add(a);
            }
        }
    }

    // ═══════════════ ENTERPRISE: Risk Index ═══════════════

    @SuppressWarnings("unchecked")
    private Map<String, Object> getRiskIndex(Map<String, Object> dashboard) {
        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> risks = new ArrayList<>();
        List<Map<String, Object>> opportunities = new ArrayList<>();
        double riskScore = 0;

        // Риски считаем по всей истории (history*), если есть; иначе по диапазону «С»–«По»
        Map<String, Object> conversion = (Map<String, Object>) firstNonNull(dashboard.get("historyConversion"), dashboard.get("conversion"));
        Map<String, Object> capacity = (Map<String, Object>) firstNonNull(dashboard.get("historyCapacity"), dashboard.get("capacity"));
        Map<String, Object> trends = (Map<String, Object>) firstNonNull(dashboard.get("historyTrends"), dashboard.get("trends"));

        // Cancel rate risk (lowered thresholds for realistic detection)
        if (conversion != null) {
            double cancelRate = toDouble(conversion.get("cancelRate"));
            if (cancelRate > 8) {
                riskScore += cancelRate > 25 ? 30 : 15;
                risks.add(Map.of("metric", "cancelRate", "severity", cancelRate > 25 ? "critical" : "warning",
                        "title", "Повышенный процент отмен", "value", round(cancelRate) + "%",
                        "action", cancelRate > 25
                                ? "Внедрите политику предоплаты или напоминания за 24ч до визита"
                                : "Отслеживайте причины отмен и внедрите SMS-напоминания"));
            }
            double retention = toDouble(conversion.get("retentionRate"));
            if (retention < 30) {
                riskScore += retention < 10 ? 25 : 15;
                risks.add(Map.of("metric", "retention", "severity", retention < 10 ? "critical" : "warning",
                        "title", "Низкая удержка клиентов", "value", round(retention) + "%",
                        "action", "Запустите программу лояльности или рассылку для повторных визитов"));
            } else if (retention > 40) {
                opportunities.add(Map.of("metric", "retention", "title", "Высокая лояльность клиентов",
                        "value", round(retention) + "%", "action", "Используйте реферальную программу для роста базы"));
            }

            // Revenue concentration opportunity
            Map<String, Object> clientLtv = (Map<String, Object>) conversion.get("clientLtv");
            if (clientLtv != null && clientLtv.size() > 5) {
                double totalRev = 0;
                List<Double> revs = new ArrayList<>();
                for (var v : clientLtv.values()) {
                    Map<String, Object> ltv = (Map<String, Object>) v;
                    double r = toDouble(ltv.get("totalRevenue"));
                    revs.add(r);
                    totalRev += r;
                }
                revs.sort(Collections.reverseOrder());
                int top10Count = Math.max(1, revs.size() / 10);
                double top10Rev = revs.stream().limit(top10Count).mapToDouble(d -> d).sum();
                double top10Pct = totalRev > 0 ? top10Rev / totalRev * 100 : 0;
                if (top10Pct > 30) {
                    opportunities.add(Map.of("metric", "concentration", "title",
                            String.format("Топ-%d%% клиентов — %.0f%% выручки", 10, top10Pct),
                            "value", String.format("%.0f%% концентрация", top10Pct),
                            "action", "Разработайте VIP-программу и диверсифицируйте базу"));
                }
            }
        }

        // Capacity risk
        if (capacity != null) {
            double idle = toDouble(capacity.get("idleCoefficient"));
            if (idle > 35) {
                riskScore += idle > 60 ? 25 : 15;
                risks.add(Map.of("metric", "idle", "severity", idle > 60 ? "critical" : "warning",
                        "title", "Простой мощностей", "value", round(idle) + "%",
                        "action", "Пересмотрите ценообразование в будни или запустите акции на слабые часы"));
            } else if (idle < 20) {
                opportunities.add(Map.of("metric", "capacity", "title", "Высокая загрузка — потенциал роста цен",
                        "value", round(100 - idle) + "% загрузки",
                        "action", "Повысьте цены в пиковые часы на 10-15%"));
            }

            double lostRevenue = toDouble(capacity.get("lostRevenueEstimate"));
            if (lostRevenue > 5000) {
                opportunities.add(Map.of("metric", "lostRevenue",
                        "title", String.format("Потенциал заполнения: ₽%.0f", lostRevenue),
                        "value", "₽" + String.format("%.0f", lostRevenue),
                        "action", "Запустите акции «Счастливые часы» для заполнения пустых слотов"));
            }
        }

        // Revenue trend risk
        if (trends != null) {
            double revDelta = toDouble(trends.get("revenueDelta"));
            if (revDelta < -5) {
                riskScore += revDelta < -15 ? 25 : 10;
                risks.add(Map.of("metric", "revenueTrend", "severity", revDelta < -15 ? "critical" : "warning",
                        "title", "Снижение выручки", "value", round(revDelta) + "%",
                        "action", revDelta < -15
                                ? "Проведите аудит цен и маркетинговых каналов"
                                : "Отследите причину снижения и скорректируйте стратегию"));
            } else if (revDelta > 5) {
                opportunities.add(Map.of("metric", "revenueTrend", "title", "Рост выручки",
                        "value", "+" + round(revDelta) + "%",
                        "action", "Масштабируйте успешные каналы привлечения"));
            }
        }

        // Normalize risk score to 0-100
        result.put("score", Math.min(100, (int) riskScore));
        result.put("level", riskScore >= 60 ? "critical" : riskScore >= 30 ? "warning" : "healthy");
        result.put("risks", risks.size() > 3 ? risks.subList(0, 3) : risks);
        result.put("opportunities", opportunities.size() > 3 ? opportunities.subList(0, 3) : opportunities);

        return result;
    }

    private double toDouble(Object o) {
        return o instanceof Number ? ((Number) o).doubleValue() : 0;
    }

    // ═══════════════ ENTERPRISE: Prescriptive Insights ═══════════════

    private static Object firstNonNull(Object a, Object b) {
        return a != null ? a : b;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> getPrescriptiveInsights(Map<String, Object> dashboard) {
        List<Map<String, Object>> prescriptions = new ArrayList<>();

        // Рекомендации по всей истории (history*), если есть
        Map<String, Object> revenue = (Map<String, Object>) firstNonNull(dashboard.get("historyRevenue"), dashboard.get("revenue"));
        Map<String, Object> capacity = (Map<String, Object>) firstNonNull(dashboard.get("historyCapacity"), dashboard.get("capacity"));
        Map<String, Object> conversion = (Map<String, Object>) firstNonNull(dashboard.get("historyConversion"), dashboard.get("conversion"));
        Map<String, Object> unitEconomics = (Map<String, Object>) firstNonNull(dashboard.get("historyUnitEconomics"), dashboard.get("unitEconomics"));

        // Revenue concentration
        if (conversion != null) {
            Map<String, Object> clientLtv = (Map<String, Object>) conversion.get("clientLtv");
            if (clientLtv != null && !clientLtv.isEmpty()) {
                double totalRev = 0;
                List<Double> revs = new ArrayList<>();
                for (var v : clientLtv.values()) {
                    Map<String, Object> ltv = (Map<String, Object>) v;
                    double r = toDouble(ltv.get("totalRevenue"));
                    revs.add(r); totalRev += r;
                }
                revs.sort(Collections.reverseOrder());
                int top10Count = Math.max(1, revs.size() / 10);
                double top10Rev = revs.stream().limit(top10Count).mapToDouble(d -> d).sum();
                double top10Pct = totalRev > 0 ? top10Rev / totalRev * 100 : 0;
                if (top10Pct > 40) {
                    prescriptions.add(Map.of(
                            "type", "revenue_concentration",
                            "priority", "high",
                            "title", "Концентрация выручки",
                            "insight", String.format("Топ-10%% клиентов генерируют %.0f%% выручки", top10Pct),
                            "action", "Разработайте VIP-программу для ключевых клиентов и диверсифицируйте базу"
                    ));
                }
            }
        }

        // Peak/off-peak pricing
        if (revenue != null) {
            Map<String, ?> byHour = (Map<String, ?>) revenue.get("byHour");
            if (byHour != null && !byHour.isEmpty()) {
                double maxHourRev = 0, minHourRev = Double.MAX_VALUE;
                String peakHour = "", offHour = "";
                for (var e : byHour.entrySet()) {
                    double v = toDouble(e.getValue());
                    String hourKey = String.valueOf(e.getKey());
                    if (v > maxHourRev) { maxHourRev = v; peakHour = hourKey; }
                    if (v < minHourRev && v > 0) { minHourRev = v; offHour = hourKey; }
                }
                if (maxHourRev > minHourRev * 3 && minHourRev > 0) {
                    prescriptions.add(Map.of(
                            "type", "dynamic_pricing",
                            "priority", "medium",
                            "title", "Возможность динамического ценообразования",
                            "insight", String.format("Пиковый час %s:00 приносит в %.0fх больше, чем %s:00",
                                    peakHour, maxHourRev / minHourRev, offHour),
                            "action", "Повысьте цены в пиковые часы на 15-20% и предложите скидки в слабые часы"
                    ));
                }
            }
        }

        // Idle capacity
        if (capacity != null) {
            double idle = toDouble(capacity.get("idleCoefficient"));
            double lostRevenue = toDouble(capacity.get("lostRevenueEstimate"));
            if (idle > 40 && lostRevenue > 0) {
                prescriptions.add(Map.of(
                        "type", "idle_capacity",
                        "priority", "high",
                        "title", "Неиспользованные мощности",
                        "insight", String.format("%.0f%% времени простаивает. Потенциальная потеря: ₽%.0f", idle, lostRevenue),
                        "action", "Запустите акции «Счастливые часы» для заполнения слабых временных слотов"
                ));
            }
        }

        return prescriptions;
    }

    // ═══════════════ FULL DASHBOARD ═══════════════

    private static final int MIN_HISTORY_DAYS_FOR_INSIGHTS = 30;
    private static final int MIN_ORDERS_FOR_INSIGHTS = 10;
    private static final int MAX_HISTORY_DAYS = 365;

    /** Диапазон «вся история ресторана» (или последний год) и флаг «достаточно для рисков/рекомендаций». */
    private HistoryRange getHistoryRange(Long restaurantId) {
        Long rid = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        if (rid == null) {
            return new HistoryRange(null, null, null, 0, false);
        }
        Optional<LocalDateTime> earliest = bookingRepository.findEarliestStartAtByBranchId(rid);
        if (earliest.isEmpty()) {
            return new HistoryRange(null, null, null, 0, false);
        }
        LocalDate first = earliest.get().toLocalDate();
        LocalDate today = LocalDate.now();
        long daysSinceFirst = ChronoUnit.DAYS.between(first, today) + 1;
        LocalDate historyTo = first.plusDays(MAX_HISTORY_DAYS - 1);
        if (historyTo.isAfter(today)) historyTo = today;
        LocalDate historyFrom = first;
        List<Booking> historyBookings = allBookings(rid, startOf(historyFrom), endOf(historyTo));
        int totalInHistory = historyBookings.size();
        boolean sufficient = daysSinceFirst >= MIN_HISTORY_DAYS_FOR_INSIGHTS && totalInHistory >= MIN_ORDERS_FOR_INSIGHTS;
        return new HistoryRange(first, historyFrom, historyTo, daysSinceFirst, sufficient);
    }

    private static class HistoryRange {
        final LocalDate firstDate;
        final LocalDate historyFrom;
        final LocalDate historyTo;
        final long daysSinceFirst;
        final boolean hasSufficientHistoryForInsights;

        HistoryRange(LocalDate firstDate, LocalDate historyFrom, LocalDate historyTo, long daysSinceFirst, boolean hasSufficientHistoryForInsights) {
            this.firstDate = firstDate;
            this.historyFrom = historyFrom;
            this.historyTo = historyTo;
            this.daysSinceFirst = daysSinceFirst;
            this.hasSufficientHistoryForInsights = hasSufficientHistoryForInsights;
        }
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getFullDashboard(LocalDate from, LocalDate to, Long restaurantId) {
        Map<String, Object> dashboard = new LinkedHashMap<>();

        // Основная аналитика — по выбранному диапазону «С» и «По»
        dashboard.put("volume", getVolumeAnalytics(from, to, restaurantId));
        dashboard.put("revenue", getRevenueAnalytics(from, to, restaurantId));
        dashboard.put("conversion", getConversionAnalytics(from, to, restaurantId));
        dashboard.put("capacity", safeCompute(() -> getCapacityAnalytics(from, to, restaurantId), "capacity"));
        dashboard.put("stopCheck", getStopCheckAnalytics(from, to, restaurantId));
        dashboard.put("tariffs", getTariffAnalytics(from, to, restaurantId));
        dashboard.put("notifications", getNotificationAnalytics(from, to, restaurantId));
        dashboard.put("heatmap", getHeatmapData(from, to, restaurantId));
        dashboard.put("trends", getTrends(from, to, restaurantId));

        dashboard.put("unitEconomics", safeCompute(() -> getUnitEconomics(from, to, restaurantId), "unitEconomics"));
        dashboard.put("rfm", safeCompute(() -> getRfmSegmentation(from, to, restaurantId), "rfm"));
        dashboard.put("cohort", safeCompute(() -> getCohortRetention(from, to, restaurantId), "cohort"));
        dashboard.put("forecast", safeCompute(() -> getForecast(from, to, restaurantId), "forecast"));

        // Риски, рекомендации, аномалии — по всей истории (макс. год), показываем через месяц после первой брони
        HistoryRange history = getHistoryRange(restaurantId);
        dashboard.put("historyFirstDate", history.firstDate != null ? history.firstDate.toString() : null);
        dashboard.put("historyDays", history.daysSinceFirst);
        dashboard.put("hasSufficientHistoryForInsights", history.hasSufficientHistoryForInsights);

        if (history.hasSufficientHistoryForInsights && history.firstDate != null) {
            LocalDate historyFrom = history.historyFrom;
            LocalDate historyTo = history.historyTo;
            dashboard.put("historyVolume", getVolumeAnalytics(historyFrom, historyTo, restaurantId));
            dashboard.put("historyRevenue", getRevenueAnalytics(historyFrom, historyTo, restaurantId));
            dashboard.put("historyConversion", getConversionAnalytics(historyFrom, historyTo, restaurantId));
            dashboard.put("historyCapacity", safeCompute(() -> getCapacityAnalytics(historyFrom, historyTo, restaurantId), "historyCapacity"));
            dashboard.put("historyTrends", getTrends(historyFrom, historyTo, restaurantId));
            dashboard.put("historyUnitEconomics", safeCompute(() -> getUnitEconomics(historyFrom, historyTo, restaurantId), "historyUnitEconomics"));
            dashboard.put("anomalies", safeComputeList(() -> getAnomalies(historyFrom, historyTo, restaurantId), "anomalies"));
            dashboard.put("riskIndex", safeCompute(() -> getRiskIndex(dashboard), "riskIndex"));
            dashboard.put("prescriptive", safeComputeList(() -> getPrescriptiveInsights(dashboard), "prescriptive"));
        } else {
            dashboard.put("anomalies", Collections.emptyList());
            dashboard.put("riskIndex", Map.of("score", 0, "level", "healthy", "risks", Collections.emptyList(), "opportunities", Collections.emptyList()));
            dashboard.put("prescriptive", Collections.emptyList());
        }

        dashboard.put("insights", getInsights(dashboard));
        return dashboard;
    }

    private Map<String, Object> safeCompute(java.util.function.Supplier<Map<String, Object>> fn, String name) {
        try {
            return fn.get();
        } catch (Exception e) {
            log.error("Error computing {}: {}", name, e.getMessage(), e);
            return Collections.emptyMap();
        }
    }

    @SuppressWarnings("unchecked")
    private <T> List<T> safeComputeList(java.util.function.Supplier<List<T>> fn, String name) {
        try {
            return fn.get();
        } catch (Exception e) {
            log.error("Error computing {}: {}", name, e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    private double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private boolean isPartialStopCheck(Booking booking, double avgRatePerMinute) {
        String notes = booking.getNotes() != null ? booking.getNotes().toLowerCase() : "";
        if (notes.contains("частично")) {
            return true;
        }
        if (booking.getTotalAmount() != null && booking.getTotalAmount().compareTo(BigDecimal.ZERO) > 0) {
            return true;
        }
        double estimatedFullPrice = minutes(booking) * avgRatePerMinute;
        return avgRatePerMinute > 0 && amount(booking) > 0 && estimatedFullPrice > amount(booking);
    }

    /**
     * Amount a customer paid or should have paid before the stop-check threshold.
     * If the billing event is fully free and no prior paid segment is present, fall back to
     * threshold minutes × observed gap-filler rate so the KPI still reflects the stop-check rule.
     */
    private double estimatedAmountBeforeStopCheck(Booking stopBooking, List<Booking> allBookings, double avgRatePerMinute) {
        if (stopBooking.getActivity() == null || !Boolean.TRUE.equals(stopBooking.getActivity().getGapFiller())) {
            return amount(stopBooking);
        }

        double stopCheckMin = stopBooking.getActivity().getStopCheckHours() != null
                ? stopBooking.getActivity().getStopCheckHours() * 60
                : 0;

        double paidSameVisit = allBookings.stream()
                .filter(b -> b.getStatus() == Booking.BookingStatus.PAID)
                .filter(b -> b.getActivity() != null && Boolean.TRUE.equals(b.getActivity().getGapFiller()))
                .filter(b -> b.getCustomerName() != null && stopBooking.getCustomerName() != null)
                .filter(b -> clientKey(b).equals(clientKey(stopBooking)))
                .filter(b -> b.getStartAt().toLocalDate().equals(stopBooking.getStartAt().toLocalDate()))
                .filter(b -> !b.getStartAt().isAfter(stopBooking.getStartAt()))
                .filter(b -> b.getTotalAmount() != null && b.getTotalAmount().compareTo(BigDecimal.ZERO) > 0)
                .mapToDouble(this::amount)
                .sum();

        if (paidSameVisit > 0) {
            return paidSameVisit;
        }
        if (stopCheckMin > 0 && avgRatePerMinute > 0) {
            return stopCheckMin * avgRatePerMinute;
        }
        return amount(stopBooking);
    }

    /** End of daily operating window; hour 24 means midnight next day (valid for {@link LocalDateTime}). */
    private static LocalDateTime resolveOperatingWindowEnd(LocalDate day, int operatingHourEnd, boolean crossesMidnight) {
        if (operatingHourEnd == 24) {
            return day.plusDays(1).atStartOfDay();
        }
        if (crossesMidnight) {
            return day.plusDays(1).atTime(operatingHourEnd, 0);
        }
        return day.atTime(operatingHourEnd, 0);
    }

    /** Operating hour window from tariff plan: [startHour, endHour). */
    private int[] resolveOperatingHours(TariffPlan tp) {
        int operatingHourStart = 10;
        int operatingHourEnd = 24;
        if (tp != null && tp.getBookingTimeFrom() != null && tp.getBookingTimeTo() != null) {
            operatingHourStart = tp.getBookingTimeFrom().getHour();
            int toHour = tp.getBookingTimeTo().getHour();
            operatingHourEnd = (tp.getBookingTimeTo().getMinute() >= 59 && toHour == 23) ? 24 : (toHour == 0 ? 24 : toHour);
        }
        return new int[]{operatingHourStart, operatingHourEnd};
    }

    private record SlotUtilization(
            double effectiveSlotHours,
            double possibleSlotHours,
            double peakConcurrent,
            double avgConcurrent,
            double peakSlotUtilizationPct,
            double avgSlotUtilizationPct,
            double utilizationPct
    ) {}

    /**
     * Capacity-aware utilization: walk each operating hour in the period,
     * count concurrent PAID bookings capped by {@code concurrentLimit}.
     * Utilization never exceeds 100%.
     */
    private SlotUtilization computeSlotUtilization(
            List<Booking> actBookings,
            int limit,
            int operatingHourStart,
            int operatingHourEnd,
            LocalDateTime periodStart,
            LocalDateTime periodEnd
    ) {
        boolean crossesMidnight = operatingHourEnd <= operatingHourStart && operatingHourEnd != 24;
        double effectiveHours = 0;
        double possibleHours = 0;
        double peakConcurrent = 0;
        double sumConcurrent = 0;
        double peakSlotPct = 0;
        double sumSlotPct = 0;
        int slotCount = 0;

        LocalDate day = periodStart.toLocalDate();
        LocalDate lastDay = periodEnd.toLocalDate();

        while (!day.isAfter(lastDay)) {
            LocalDateTime windowStart = day.atTime(operatingHourStart, 0);
            LocalDateTime windowEnd = resolveOperatingWindowEnd(day, operatingHourEnd, crossesMidnight);

            LocalDateTime slotStart = windowStart;
            while (slotStart.isBefore(windowEnd)) {
                LocalDateTime slotEnd = slotStart.plusHours(1);
                if (slotEnd.isAfter(periodStart) && slotStart.isBefore(periodEnd)) {
                    LocalDateTime effStart = slotStart.isBefore(periodStart) ? periodStart : slotStart;
                    LocalDateTime effEnd = slotEnd.isAfter(periodEnd) ? periodEnd : slotEnd;
                    if (effStart.isBefore(effEnd)) {
                        int concurrent = (int) actBookings.stream()
                                .filter(b -> b.getStartAt().isBefore(effEnd) && b.getEndAt().isAfter(effStart))
                                .count();
                        double used = Math.min(concurrent, limit);
                        double slotPct = limit > 0 ? Math.min(100.0, used / limit * 100.0) : 0;
                        effectiveHours += used;
                        possibleHours += limit;
                        peakConcurrent = Math.max(peakConcurrent, concurrent);
                        sumConcurrent += concurrent;
                        peakSlotPct = Math.max(peakSlotPct, slotPct);
                        sumSlotPct += slotPct;
                        slotCount++;
                    }
                }
                slotStart = slotEnd;
            }
            day = day.plusDays(1);
        }

        double utilizationPct = possibleHours > 0
                ? Math.min(100.0, effectiveHours / possibleHours * 100.0)
                : 0;
        double avgConcurrent = slotCount > 0 ? sumConcurrent / slotCount : 0;
        double avgSlotPct = slotCount > 0 ? Math.min(100.0, sumSlotPct / slotCount) : 0;

        return new SlotUtilization(
                effectiveHours,
                possibleHours,
                peakConcurrent,
                avgConcurrent,
                peakSlotPct,
                avgSlotPct,
                utilizationPct
        );
    }
}
