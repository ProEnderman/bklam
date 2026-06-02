package com.restaurant.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.restaurant.dto.DemoBookingTariffSeedResult;
import com.restaurant.exception.BusinessException;
import com.restaurant.model.Activity;
import com.restaurant.model.Booking;
import com.restaurant.model.BookingOrder;
import com.restaurant.model.Calendar;
import com.restaurant.model.PricingRun;
import com.restaurant.model.Restaurant;
import com.restaurant.model.TariffPlan;
import com.restaurant.model.TariffRule;
import com.restaurant.model.TariffSpecialDateModifier;
import com.restaurant.repository.ActivityRepository;
import com.restaurant.repository.BookingOrderRepository;
import com.restaurant.repository.BookingRepository;
import com.restaurant.repository.CalendarRepository;
import com.restaurant.repository.PricingBreakdownRepository;
import com.restaurant.repository.PricingRunRepository;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.TariffPlanRepository;
import com.restaurant.repository.TariffRuleRepository;
import com.restaurant.repository.TariffSpecialDateModifierRepository;
import com.restaurant.security.SecurityUtils;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.Callable;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * Dev/staging demo generator for tariff activities and bookings (booking analytics).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DemoBookingTariffSeedService {

    static final String PREFIX = "DEMO_SEED_";
    static final String CLIENT_PREFIX = "DEMO_SEED Client ";
    static final String RETENTION_CLIENT_PREFIX = "DEMO_SEED Retention ";
    private static final int BATCH_SIZE = 35;
    private static final int REPEAT_CLIENT_POOL_SIZE = 250;
    private final ActivityService activityService;
    private final CalendarService calendarService;
    private final TariffService tariffService;
    private final TariffSpecialDateModifierService modifierService;
    private final BookingService bookingService;
    private final BookingOrderService bookingOrderService;
    private final PricingService pricingService;
    private final ActivityRepository activityRepository;
    private final CalendarRepository calendarRepository;
    private final TariffPlanRepository tariffPlanRepository;
    private final TariffRuleRepository tariffRuleRepository;
    private final TariffSpecialDateModifierRepository modifierRepository;
    private final BookingRepository bookingRepository;
    private final BookingOrderRepository bookingOrderRepository;
    private final PricingRunRepository pricingRunRepository;
    private final PricingBreakdownRepository pricingBreakdownRepository;
    private final RestaurantRepository restaurantRepository;
    private final TransactionTemplate transactionTemplate;
    private final PlatformTransactionManager transactionManager;
    private final ObjectMapper objectMapper;

    private TransactionTemplate txRequiresNew;

    @Value("${demo.booking-seed.enabled:false}")
    private boolean enabled;

    @PostConstruct
    void initTxTemplates() {
        txRequiresNew = new TransactionTemplate(transactionManager);
        txRequiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Runs work in a fresh transaction. Failures must not be caught inside the callback — that leaves the
     * transaction rollback-only and commit throws UnexpectedRollbackException.
     */
    private <T> Optional<T> runInNewTx(Callable<T> action) {
        try {
            T result = txRequiresNew.execute(status -> {
                try {
                    return action.call();
                } catch (RuntimeException ex) {
                    throw ex;
                } catch (Exception ex) {
                    throw new RuntimeException(ex);
                }
            });
            return Optional.ofNullable(result);
        } catch (RuntimeException ex) {
            log.trace("Demo booking seed attempt failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public DemoBookingTariffSeedResult seedTariffBookings(int count, int daysBack, boolean reset) {
        assertEnabledAndRole();
        Long restaurantId = requireRestaurantId();
        if (count < 1 || count > 5000) {
            throw new BusinessException("count must be between 1 and 5000");
        }
        if (daysBack < 1 || daysBack > 730) {
            throw new BusinessException("daysBack must be between 1 and 730");
        }

        List<String> errors = new ArrayList<>();
        try {
            if (reset) {
                transactionTemplate.executeWithoutResult(s -> resetDemoOnly(restaurantId));
            }
        } catch (Exception e) {
            log.error("Demo booking seed reset failed for restaurant {}", restaurantId, e);
            throw new BusinessException("Demo reset failed: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }

        SeedContext ctx;
        try {
            ctx = transactionTemplate.execute(s -> prepareContext(restaurantId, daysBack));
        } catch (Exception e) {
            log.error("Demo booking seed prepare failed for restaurant {}", restaurantId, e);
            throw new BusinessException("Demo prepare failed: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
        if (ctx == null) {
            throw new BusinessException("Failed to prepare demo tariff context");
        }

        Map<String, Integer> scenarioBreakdown = new LinkedHashMap<>();
        Map<String, Integer> existingUsed = new LinkedHashMap<>();
        int bookingsCreated = 0;
        int bookingOrdersCreated = 0;
        ThreadLocalRandom rnd = ThreadLocalRandom.current();
        LocalDateTime now = LocalDateTime.now();

        for (int offset = 0; offset < count; offset += BATCH_SIZE) {
            int batch = Math.min(BATCH_SIZE, count - offset);
            int[] stats = seedBatch(ctx, batch, daysBack, now, rnd, scenarioBreakdown, existingUsed, errors);
            bookingsCreated += stats[0];
            bookingOrdersCreated += stats[1];
        }

        String msg = String.format(
            "Created %d bookings (%d booking orders, %d demo activities) over last %d days",
            bookingsCreated, bookingOrdersCreated, ctx.activitiesCreated(), daysBack);
        log.info("Demo booking tariff seed restaurant {}: {}", restaurantId, msg);
        return new DemoBookingTariffSeedResult(
            bookingsCreated,
            bookingOrdersCreated,
            ctx.activitiesCreated(),
            scenarioBreakdown,
            existingUsed,
            msg,
            errors.isEmpty() ? List.of() : errors,
            0
        );
    }

    /**
     * Adds PAID bookings for repeat clients (same phone) across weeks W0..W12 for cohort retention charts.
     * Does not reset existing demo data. Use batched calls (e.g. 300–400 per request) to avoid gateway timeouts.
     */
    public DemoBookingTariffSeedResult seedCohortRetention(int targetBookings, int daysBack, int startClientSeq) {
        assertEnabledAndRole();
        Long restaurantId = requireRestaurantId();
        if (targetBookings < 1 || targetBookings > 5000) {
            throw new BusinessException("targetBookings must be between 1 and 5000");
        }
        if (daysBack < 28 || daysBack > 730) {
            throw new BusinessException("daysBack must be between 28 and 730 for cohort retention");
        }

        SeedContext ctx = transactionTemplate.execute(s -> prepareContext(restaurantId, daysBack));
        if (ctx == null) {
            throw new BusinessException("Failed to prepare demo tariff context");
        }

        Map<String, Integer> scenarioBreakdown = new LinkedHashMap<>();
        Map<String, Integer> existingUsed = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();
        ThreadLocalRandom rnd = ThreadLocalRandom.current();
        LocalDateTime now = LocalDateTime.now();
        int bookingsCreated = 0;
        int bookingOrdersCreated = 0;
        int clientSeq = Math.max(0, startClientSeq);

        bump(scenarioBreakdown, "COHORT_RETENTION");

        while (bookingsCreated < targetBookings && clientSeq < startClientSeq + 15_000) {
            clientSeq++;
            ClientIdentity client = retentionClient(clientSeq);
            LocalDate cohortMonday = randomCohortMonday(daysBack, now.toLocalDate(), rnd);
            LocalDate refMonday = now.toLocalDate().with(DayOfWeek.MONDAY);
            int maxWeek = (int) ChronoUnit.WEEKS.between(cohortMonday, refMonday);
            if (maxWeek < 0) {
                continue;
            }
            maxWeek = Math.min(maxWeek, 12);

            Long orderId = null;
            if (rnd.nextInt(100) < 55) {
                orderId = runInNewTx(() -> bookingOrderService.create(ctx.restaurantId(), client.name(), client.phone()).getId())
                    .orElse(null);
                if (orderId != null) {
                    bookingOrdersCreated++;
                }
            }

            for (int week = 0; week <= maxWeek && bookingsCreated < targetBookings; week++) {
                if (week > 0 && rnd.nextInt(100) >= cohortRetentionPercent(week)) {
                    continue;
                }
                Long activityId = pickNonVisitActivity(ctx, rnd);
                if (activityId == null) {
                    continue;
                }
                trackExisting(existingUsed, ctx, activityId);
                LocalDate visitDay = cohortMonday.plusWeeks(week).plusDays(rnd.nextInt(5));
                LocalDateTime start = randomStartOnDay(ctx, activityId, visitDay, rnd);
                LocalDateTime end = fitEndToWindow(ctx, activityId, start, start.plusHours(1 + rnd.nextInt(2)));
                if (createAndFinalizeSlot(
                    ctx, activityId, start, end, client.name(), client.phone(),
                    SeedScenario.PAID_CONFIRMED, null, null, null,
                    Booking.BookingStatus.CONFIRMED, rnd, orderId
                ).isPresent()) {
                    bookingsCreated++;
                }
            }
        }

        int clientsThisRun = Math.max(0, clientSeq - startClientSeq);
        String msg = String.format(
            "Cohort retention batch: %d bookings (%d orders), %d clients (seq %d→%d), daysBack=%d",
            bookingsCreated, bookingOrdersCreated, clientsThisRun, startClientSeq, clientSeq, daysBack);
        log.info("Demo cohort retention seed restaurant {}: {}", restaurantId, msg);
        return new DemoBookingTariffSeedResult(
            bookingsCreated,
            bookingOrdersCreated,
            0,
            scenarioBreakdown,
            existingUsed,
            msg,
            errors,
            clientSeq
        );
    }

    private void assertEnabledAndRole() {
        if (!enabled) {
            throw new BusinessException(
                "Demo booking seed is disabled. Set DEMO_BOOKING_SEED_ENABLED=true (or demo.booking-seed.enabled=true).");
        }
        if (!SecurityUtils.isAdmin() && !SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("Only ADMIN or HEAD_ADMIN can seed demo bookings");
        }
    }

    private Long requireRestaurantId() {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant context is required (use ?restaurantId= for HEAD_ADMIN)");
        }
        return restaurantId;
    }

    private void resetDemoOnly(Long restaurantId) {
        List<Activity> demoActs = activityRepository.findActivities(restaurantId, null).stream()
            .filter(a -> a.getName() != null && a.getName().startsWith(PREFIX))
            .toList();
        List<Long> demoActIds = demoActs.stream().map(Activity::getId).toList();

        bookingRepository.deleteDemoSeedBookingsByClientPrefix(restaurantId, CLIENT_PREFIX + "%");
        if (!demoActIds.isEmpty()) {
            bookingRepository.deleteBookingsByActivityIds(restaurantId, demoActIds);
        }

        bookingOrderRepository.deleteDemoSeedBookingOrders(restaurantId, CLIENT_PREFIX + "%");

        for (Activity a : demoActs) {
            activityService.deleteActivity(a.getId());
        }

        List<TariffPlan> plans = tariffPlanRepository.findByRestaurantId(restaurantId).stream()
            .filter(p -> p.getName() != null && p.getName().startsWith(PREFIX))
            .toList();
        for (TariffPlan plan : plans) {
            modifierRepository.deleteByTariffPlanId(plan.getId());
            List<TariffRule> rules = tariffRuleRepository.findByTariffPlanIdOrderByRuleOrderAsc(plan.getId());
            List<Long> ruleIds = rules.stream().map(TariffRule::getId).filter(Objects::nonNull).toList();
            if (!ruleIds.isEmpty()) {
                pricingBreakdownRepository.deleteByTariffRuleIdIn(ruleIds);
            }
            for (TariffRule rule : rules) {
                tariffRuleRepository.delete(rule);
            }
            Long calId = plan.getCalendar() != null ? plan.getCalendar().getId() : null;
            tariffService.deleteTariffPlan(plan.getId());
            if (calId != null) {
                calendarRepository.findById(calId).ifPresent(c -> {
                    if (c.getName() != null && c.getName().startsWith(PREFIX)) {
                        calendarRepository.delete(c);
                    }
                });
            }
        }
        log.info("Reset DEMO_SEED_ tariff entities for restaurant {}", restaurantId);
    }

    private SeedContext prepareContext(Long restaurantId, int daysBack) {
        int activitiesCreated = ensureDemoInfrastructure(restaurantId, daysBack);
        List<Activity> all = activityRepository.findActivities(restaurantId, Activity.ActivityStatus.ACTIVE);
        Long cinema = findActivityId(all, "кинотеатр", "кинозал");
        Long billiard = findActivityId(all, "бильярд");
        Long visit = findActivityId(all, "посещение");
        if (visit == null) {
            log.warn("Gap/stop-check activity «Посещение» not found — those scenarios will be skipped");
        }

        Activity karaoke = findByPrefixName(all, PREFIX + "Караоке");
        Activity bowling = findByPrefixName(all, PREFIX + "Боулинг");
        Activity vr = findByPrefixName(all, PREFIX + "VR-зона");

        return new SeedContext(
            restaurantId,
            activitiesCreated,
            cinema,
            billiard,
            visit,
            karaoke != null ? karaoke.getId() : null,
            bowling != null ? bowling.getId() : null,
            vr != null ? vr.getId() : null,
            specialDatesOf(karaoke),
            specialDatesOf(bowling),
            specialDatesOf(vr),
            planHoursFrom(karaoke),
            planHoursFrom(bowling),
            planHoursFrom(vr)
        );
    }

    private PlanHours planHoursFrom(Activity activity) {
        if (activity == null || activity.getTariffPlan() == null || activity.getTariffPlan().getId() == null) {
            return PlanHours.defaults();
        }
        TariffPlan plan = tariffService.getTariffPlanById(activity.getTariffPlan().getId());
        LocalTime from = plan.getBookingTimeFrom() != null ? plan.getBookingTimeFrom() : LocalTime.of(12, 0);
        LocalTime to = plan.getBookingTimeTo() != null ? plan.getBookingTimeTo() : LocalTime.of(22, 0);
        boolean overnight = to.isBefore(from);
        return new PlanHours(from, to, overnight);
    }

    private List<LocalDate> specialDatesOf(Activity activity) {
        if (activity == null || activity.getTariffPlan() == null || activity.getTariffPlan().getId() == null) {
            return List.of();
        }
        TariffPlan plan = tariffService.getTariffPlanById(activity.getTariffPlan().getId());
        if (plan.getCalendar() == null || plan.getCalendar().getSpecialDates() == null) {
            return List.of();
        }
        return new ArrayList<>(plan.getCalendar().getSpecialDates());
    }

    private int ensureDemoInfrastructure(Long restaurantId, int daysBack) {
        int created = 0;
        if (findByPrefixName(activityRepository.findActivities(restaurantId, null), PREFIX + "Караоке") == null) {
            buildKaraokeStack(restaurantId, daysBack);
            created++;
        }
        if (findByPrefixName(activityRepository.findActivities(restaurantId, null), PREFIX + "Боулинг") == null) {
            buildBowlingStack(restaurantId, daysBack);
            created++;
        }
        if (findByPrefixName(activityRepository.findActivities(restaurantId, null), PREFIX + "VR-зона") == null) {
            buildVrStack(restaurantId, daysBack);
            created++;
        }
        return created;
    }

    private void buildKaraokeStack(Long restaurantId, int daysBack) {
        List<LocalDate> specials = randomSpecialDates(daysBack, 12, ThreadLocalRandom.current());
        Calendar cal = new Calendar();
        cal.setName(PREFIX + "Календарь Караоке");
        cal.setWeekendRule(Calendar.WeekendRule.SAT_SUN);
        cal.setSpecialDates(new ArrayList<>(specials));
        cal = calendarService.createCalendar(cal);

        TariffPlan plan = new TariffPlan();
        plan.setName(PREFIX + "Тариф Караоке");
        plan.setIsActive(true);
        plan.setBookingTimeFrom(LocalTime.of(18, 0));
        plan.setBookingTimeTo(LocalTime.of(2, 0));
        plan.setCalendar(cal);
        plan = tariffService.createTariffPlan(plan);

        createRule(plan.getId(), TariffRule.RuleType.STANDARD, 0, timeBasedJson(
            interval("18:00", "22:00", 2500),
            interval("22:00", "02:00", 3500)
        ), null);
        createRule(plan.getId(), TariffRule.RuleType.WEEKEND, 1, timeBasedJson(
            interval("18:00", "22:00", 3000),
            interval("22:00", "02:00", 4200)
        ), null);
        int order = 2;
        for (LocalDate d : specials) {
            createRule(plan.getId(), TariffRule.RuleType.HOLIDAY, order++, timeBasedJson(
                interval("18:00", "23:00", 4000),
                interval("23:00", "02:00", 5000)
            ), holidayCondition(d));
        }
        modifierService.initializeModifiersForCalendar(plan.getId(), cal.getId());
        applyKaraokeModifiers(plan.getId(), specials);

        Activity act = new Activity();
        act.setName(PREFIX + "Караоке");
        act.setStatus(Activity.ActivityStatus.ACTIVE);
        act.setBookingMode(Activity.BookingMode.EXCLUSIVE);
        act.setConcurrentLimit(1);
        act.setGapFiller(false);
        act.setFullVenueLock(false);
        act.setTariffPlan(plan);
        activityService.createActivity(act);
    }

    private void buildBowlingStack(Long restaurantId, int daysBack) {
        List<LocalDate> specials = randomSpecialDates(daysBack, 7, ThreadLocalRandom.current());
        Calendar cal = new Calendar();
        cal.setName(PREFIX + "Календарь Боулинг");
        cal.setWeekendRule(Calendar.WeekendRule.CUSTOM);
        cal.setWeekendDays("[5,6,7]");
        cal.setSpecialDates(new ArrayList<>(specials));
        cal = calendarService.createCalendar(cal);

        TariffPlan plan = new TariffPlan();
        plan.setName(PREFIX + "Тариф Боулинг");
        plan.setIsActive(true);
        plan.setBookingTimeFrom(LocalTime.of(12, 0));
        plan.setBookingTimeTo(LocalTime.of(23, 0));
        plan.setCalendar(cal);
        plan = tariffService.createTariffPlan(plan);

        createRule(plan.getId(), TariffRule.RuleType.STANDARD, 0, timeBasedJson(
            interval("12:00", "17:00", 1800),
            interval("17:00", "23:00", 2400)
        ), null);
        createRule(plan.getId(), TariffRule.RuleType.WEEKEND, 1, timeBasedJson(
            interval("12:00", "17:00", 2200),
            interval("17:00", "23:00", 2900)
        ), null);
        int order = 2;
        for (LocalDate d : specials) {
            createRule(plan.getId(), TariffRule.RuleType.HOLIDAY, order++, timeBasedJson(
                interval("12:00", "23:00", 3200)
            ), holidayCondition(d));
        }
        modifierService.initializeModifiersForCalendar(plan.getId(), cal.getId());
        applyBowlingModifiers(plan.getId(), specials);

        Activity act = new Activity();
        act.setName(PREFIX + "Боулинг");
        act.setStatus(Activity.ActivityStatus.ACTIVE);
        act.setBookingMode(Activity.BookingMode.CAPACITY);
        act.setConcurrentLimit(6);
        act.setGapFiller(false);
        act.setFullVenueLock(false);
        act.setTariffPlan(plan);
        activityService.createActivity(act);
    }

    private void buildVrStack(Long restaurantId, int daysBack) {
        List<LocalDate> specials = randomSpecialDates(daysBack, 4, ThreadLocalRandom.current());
        Calendar cal = new Calendar();
        cal.setName(PREFIX + "Календарь VR");
        cal.setWeekendRule(Calendar.WeekendRule.MON_FRI);
        cal.setSpecialDates(new ArrayList<>(specials));
        cal = calendarService.createCalendar(cal);

        TariffPlan plan = new TariffPlan();
        plan.setName(PREFIX + "Тариф VR");
        plan.setIsActive(true);
        plan.setBookingTimeFrom(LocalTime.of(12, 0));
        plan.setBookingTimeTo(LocalTime.of(22, 0));
        plan.setCalendar(cal);
        plan = tariffService.createTariffPlan(plan);

        createRule(plan.getId(), TariffRule.RuleType.STANDARD, 0, perHourJson(1200), null);
        createRule(plan.getId(), TariffRule.RuleType.WEEKEND, 1, timeBasedJson(
            interval("12:00", "18:00", 1400),
            interval("18:00", "22:00", 1800)
        ), null);
        int order = 2;
        for (LocalDate d : specials) {
            createRule(plan.getId(), TariffRule.RuleType.HOLIDAY, order++, perMinuteJson(18), holidayCondition(d));
        }
        modifierService.initializeModifiersForCalendar(plan.getId(), cal.getId());
        applyVrModifiers(plan.getId(), specials);

        Activity act = new Activity();
        act.setName(PREFIX + "VR-зона");
        act.setStatus(Activity.ActivityStatus.ACTIVE);
        act.setBookingMode(Activity.BookingMode.CAPACITY);
        act.setConcurrentLimit(2);
        act.setGapFiller(false);
        act.setFullVenueLock(false);
        act.setTariffPlan(plan);
        activityService.createActivity(act);
    }

    private int[] seedBatch(
        SeedContext ctx,
        int batchSize,
        int daysBack,
        LocalDateTime now,
        ThreadLocalRandom rnd,
        Map<String, Integer> scenarioBreakdown,
        Map<String, Integer> existingUsed,
        List<String> errors
    ) {
        int bookings = 0;
        int orders = 0;
        for (int i = 0; i < batchSize; i++) {
            try {
                int[] row = seedOneRow(ctx, daysBack, now, rnd, scenarioBreakdown, existingUsed);
                bookings += row[0];
                orders += row[1];
            } catch (Exception e) {
                log.debug("Demo booking seed row failed: {}", e.getMessage());
                errors.add(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            }
        }
        return new int[] { bookings, orders };
    }

  private int[] seedOneRow(
        SeedContext ctx,
        int daysBack,
        LocalDateTime now,
        ThreadLocalRandom rnd,
        Map<String, Integer> scenarioBreakdown,
        Map<String, Integer> existingUsed
    ) {
        SeedScenario scenario = pickScenario(rnd);
        bump(scenarioBreakdown, scenario.name());
        if (scenario == SeedScenario.BOOKING_ORDER_GROUP) {
            int n = seedBookingOrderGroup(ctx, daysBack, now, rnd, scenarioBreakdown, existingUsed);
            return new int[] { n, 1 };
        }
        if (scenario == SeedScenario.GAP_FILLER && ctx.visitActivityId() == null) {
            scenario = SeedScenario.STANDARD_WEEKDAY;
            bump(scenarioBreakdown, scenario.name());
        }
        if (scenario == SeedScenario.STOP_CHECK && ctx.visitActivityId() == null) {
            scenario = SeedScenario.PAID_CONFIRMED;
            bump(scenarioBreakdown, scenario.name());
        }
        Long activityId = pickActivity(ctx, scenario, rnd);
        if (activityId == null) {
            return new int[] { 0, 0 };
        }
        trackExisting(existingUsed, ctx, activityId);
        if (scenario == SeedScenario.GAP_FILLER) {
            int n = seedGapScenario(ctx, daysBack, now, rnd);
            bump(scenarioBreakdown, "GAP_FILLER");
            return new int[] { n, 0 };
        }
        boolean ok = seedSingleBooking(ctx, activityId, scenario, daysBack, now, rnd);
        return new int[] { ok ? 1 : 0, 0 };
    }

    private int seedGapScenario(SeedContext ctx, int daysBack, LocalDateTime now, ThreadLocalRandom rnd) {
        Long mainA = pickNonVisitActivity(ctx, rnd);
        Long mainB = pickNonVisitActivity(ctx, rnd);
        if (mainA == null || mainB == null || ctx.visitActivityId() == null) {
            return 0;
        }
        String name = clientName(rnd);
        String phone = clientPhone(rnd);
        Long orderId = runInNewTx(() -> bookingOrderService.create(ctx.restaurantId(), name, phone).getId())
            .orElse(null);
        LocalDateTime startA = randomStartForActivity(ctx, mainA, daysBack, now, rnd);
        LocalDateTime endA = fitEndToWindow(ctx, mainA, startA, startA.plusHours(2));
        Optional<CreatedSlot> slotA = createAndFinalizeSlot(
            ctx, mainA, startA, endA, name, phone, SeedScenario.PAID_CONFIRMED, null, null, null,
            Booking.BookingStatus.CONFIRMED, rnd, orderId);
        if (slotA.isEmpty()) {
            return 0;
        }
        LocalDateTime actualEndA = slotA.get().endAt();
        LocalDateTime startB = actualEndA.plusMinutes(45 + rnd.nextInt(75));
        LocalDateTime endB = fitEndToWindow(ctx, mainB, startB, startB.plusHours(1 + rnd.nextInt(2)));
        LocalDateTime gapStart = actualEndA.plusMinutes(15);
        LocalDateTime gapEndRaw = startB.minusMinutes(15);
        final LocalDateTime gapEnd = gapEndRaw.isAfter(gapStart) ? gapEndRaw : gapStart.plusMinutes(30);
        int created = 1;
        boolean gapOk = runInNewTx(() -> {
            Booking gap = buildBooking(ctx, ctx.visitActivityId(), gapStart, gapEnd, name, phone);
            if (orderId != null) {
                gap.setBookingOrderId(orderId);
            }
            gap.setNotes("Автозаполнение пробела");
            gap.setStatus(Booking.BookingStatus.CONFIRMED);
            gap = bookingService.createBooking(gap);
            Long gapId = gap.getId();
            if (gapId == null) {
                throw new BusinessException("Gap booking was not persisted");
            }
            bookingService.markAsPaid(gapId);
            patchTimestamps(gapId, gapStart.minusHours(1), gapStart, null);
            return true;
        }).orElse(false);
        if (gapOk) {
            created++;
        }
        Optional<CreatedSlot> slotB = createAndFinalizeSlot(
            ctx, mainB, startB, endB, name, phone, SeedScenario.PAID_CONFIRMED, null, null, null,
            Booking.BookingStatus.CONFIRMED, rnd, orderId);
        if (slotB.isPresent()) {
            created++;
        }
        return created;
    }

    private int seedBookingOrderGroup(
        SeedContext ctx,
        int daysBack,
        LocalDateTime now,
        ThreadLocalRandom rnd,
        Map<String, Integer> scenarioBreakdown,
        Map<String, Integer> existingUsed
    ) {
        String name = clientName(rnd);
        String phone = clientPhone(rnd);
        Optional<BookingOrder> orderOpt = runInNewTx(() -> bookingOrderService.create(ctx.restaurantId(), name, phone));
        if (orderOpt.isEmpty() || orderOpt.get().getId() == null) {
            return 0;
        }
        Long orderId = orderOpt.get().getId();
        int lines = 2 + rnd.nextInt(3);
        int created = 0;
        Long anchorAct = pickNonVisitActivity(ctx, rnd);
        if (anchorAct == null) {
            return 0;
        }
        LocalDateTime anchorStart = randomStartForActivity(ctx, anchorAct, daysBack, now, rnd);
        LocalDate visitDay = anchorStart.toLocalDate();
        LocalDateTime slotCursor = anchorStart;
        for (int i = 0; i < lines; i++) {
            Long actId = i == 0 ? anchorAct : pickNonVisitActivity(ctx, rnd);
            if (actId == null) {
                continue;
            }
            trackExisting(existingUsed, ctx, actId);
            LocalDateTime start;
            if (i == 0) {
                start = anchorStart;
            } else {
                slotCursor = slotCursor.plusHours(2 + rnd.nextInt(2));
                start = alignStartToActivityHours(ctx, actId, visitDay.atTime(slotCursor.toLocalTime()));
            }
            LocalDateTime end = fitEndToWindow(ctx, actId, start, start.plusHours(1 + rnd.nextInt(2)));
            if (!end.isAfter(start)) {
                continue;
            }
            slotCursor = end;
            final LocalDateTime fs = start;
            final LocalDateTime fe = end;
            boolean ok = runInNewTx(() -> persistBookingSlot(
                ctx, actId, fs, fe, name, phone, SeedScenario.PAID_CONFIRMED, null, null, null,
                Booking.BookingStatus.CONFIRMED, rnd, orderId
            )).isPresent();
            if (ok) {
                created++;
            }
        }
        bump(scenarioBreakdown, "BOOKING_ORDER_GROUP");
        return created;
    }

    private boolean seedSingleBooking(
        SeedContext ctx,
        Long activityId,
        SeedScenario scenario,
        int daysBack,
        LocalDateTime now,
        ThreadLocalRandom rnd
    ) {
        boolean overnight = scenario == SeedScenario.OVERNIGHT;
        boolean multiDay = scenario == SeedScenario.MULTI_DAY;
        LocalDateTime start = randomStartForActivity(ctx, activityId, daysBack, now, rnd);
        LocalDateTime end;
        if (multiDay) {
            end = start.plusDays(1).plusHours(1 + rnd.nextInt(2));
        } else if (overnight) {
            end = start.plusHours(2 + rnd.nextInt(2));
            if (end.toLocalDate().equals(start.toLocalDate())) {
                end = start.toLocalDate().plusDays(1).atTime(1, 30);
            }
        } else {
            end = start.plusMinutes(60 + rnd.nextInt(120));
        }
        if (scenario == SeedScenario.HOLIDAY) {
            List<LocalDate> specials = specialDatesForActivity(ctx, activityId);
            if (!specials.isEmpty()) {
                LocalDate holiday = specials.get(rnd.nextInt(specials.size()));
                start = holiday.atTime(start.toLocalTime());
                end = start.plusHours(2);
            }
        } else if (scenario == SeedScenario.WEEKEND) {
            start = nextWeekend(start);
            end = start.plusHours(2);
        } else if (scenario == SeedScenario.STANDARD_WEEKDAY) {
            start = nextWeekday(start);
            end = start.plusHours(1 + rnd.nextInt(2));
        }

        Integer discount = scenario == SeedScenario.DISCOUNT ? 5 + rnd.nextInt(16) : null;
        BigDecimal presetTotal = null;
        String notes = null;
        if (scenario == SeedScenario.STOP_CHECK) {
            activityId = ctx.visitActivityId();
            boolean partialStopCheck = rnd.nextInt(100) < 45;
            presetTotal = partialStopCheck
                ? BigDecimal.valueOf(700 + rnd.nextInt(1600))
                : BigDecimal.ZERO;
            notes = partialStopCheck
                ? "Пребывание до оплаты [стоп-чек — частично]"
                : "Пребывание до оплаты [стоп-чек — бесплатно]";
            end = start.plusHours(4 + rnd.nextInt(3));
        }
        if (activityId != null) {
            end = fitEndToWindow(ctx, activityId, start, end);
        }

        Booking.BookingStatus status = switch (scenario) {
            case CANCELLED -> Booking.BookingStatus.CANCELLED;
            case DRAFT -> Booking.BookingStatus.DRAFT;
            default -> Booking.BookingStatus.CONFIRMED;
        };

        ClientIdentity client = pooledClient(rnd);
        String name = client.name();
        String phone = client.phone();
        boolean attachOrder = status != Booking.BookingStatus.CANCELLED
            && status != Booking.BookingStatus.DRAFT
            && rnd.nextInt(100) < 45;
        Long orderId = null;
        if (attachOrder) {
            orderId = runInNewTx(() -> bookingOrderService.create(ctx.restaurantId(), name, phone).getId())
                .orElse(null);
        }
        final Long linkedOrderId = orderId;
        return createAndFinalizeSlot(
            ctx, activityId, start, end, name, phone,
            scenario, discount, notes, presetTotal, status, rnd, linkedOrderId
        ).isPresent();
    }

    private record CreatedSlot(Long bookingId, LocalDateTime startAt, LocalDateTime endAt) {}

    private Optional<CreatedSlot> createAndFinalizeSlot(
        SeedContext ctx,
        Long activityId,
        LocalDateTime start,
        LocalDateTime end,
        String name,
        String phone,
        SeedScenario scenario,
        Integer discountPercent,
        String notes,
        BigDecimal presetTotal,
        Booking.BookingStatus status,
        ThreadLocalRandom rnd
    ) {
        return createAndFinalizeSlot(
            ctx, activityId, start, end, name, phone, scenario, discountPercent, notes, presetTotal, status, rnd, null);
    }

    private Optional<CreatedSlot> createAndFinalizeSlot(
        SeedContext ctx,
        Long activityId,
        LocalDateTime start,
        LocalDateTime end,
        String name,
        String phone,
        SeedScenario scenario,
        Integer discountPercent,
        String notes,
        BigDecimal presetTotal,
        Booking.BookingStatus status,
        ThreadLocalRandom rnd,
        Long bookingOrderId
    ) {
        LocalDateTime s = start;
        LocalDateTime e = end;
        for (int attempt = 0; attempt < 4; attempt++) {
            final LocalDateTime fs = s;
            final LocalDateTime fe = e;
            Optional<CreatedSlot> slot = runInNewTx(() -> persistBookingSlot(
                ctx, activityId, fs, fe, name, phone, scenario, discountPercent, notes, presetTotal, status, rnd,
                bookingOrderId));
            if (slot.isPresent()) {
                return slot;
            }
            s = alignStartToActivityHours(ctx, activityId, s.plusHours(1 + attempt));
            e = fitEndToWindow(ctx, activityId, s, fe.plusHours(1 + attempt));
        }
        return Optional.empty();
    }

    private CreatedSlot persistBookingSlot(
        SeedContext ctx,
        Long activityId,
        LocalDateTime start,
        LocalDateTime end,
        String name,
        String phone,
        SeedScenario scenario,
        Integer discountPercent,
        String notes,
        BigDecimal presetTotal,
        Booking.BookingStatus status,
        ThreadLocalRandom rnd,
        Long bookingOrderId
    ) {
        Booking booking = buildBooking(ctx, activityId, start, end, name, phone);
        if (bookingOrderId != null) {
            booking.setBookingOrderId(bookingOrderId);
        }
        booking.setStatus(status);
        if (notes != null) {
            booking.setNotes(notes);
        }
        if (presetTotal != null) {
            booking.setTotalAmount(presetTotal);
        } else if (discountPercent != null) {
            PricingService.PricingRequest req = new PricingService.PricingRequest();
            req.setRestaurantId(ctx.restaurantId());
            req.setServiceId(activityId);
            req.setServiceStart(start);
            req.setServiceEnd(end);
            req.setDiscountPercent(BigDecimal.valueOf(discountPercent));
            PricingService.PricingResult pr = pricingService.run(req);
            if (pr.getTotalAmount() != null) {
                booking.setTotalAmount(pr.getTotalAmount());
            }
            if (pr.getPricingRunId() != null) {
                pricingRunRepository.findById(pr.getPricingRunId()).ifPresent(booking::setPricingRun);
            }
        }
        booking = bookingService.createBooking(booking);
        Long bookingId = booking.getId();
        if (bookingId == null) {
            throw new BusinessException("Booking was not persisted");
        }
        LocalDateTime paidAt = null;
        LocalDateTime cancelledAt = null;
        if (status == Booking.BookingStatus.CANCELLED) {
            bookingService.cancelBooking(bookingId);
            cancelledAt = end.plusMinutes(5);
        } else if (scenario != SeedScenario.DRAFT) {
            bookingService.markAsPaid(bookingId);
            paidAt = end.plusMinutes(10 + rnd.nextInt(20));
        }
        patchTimestamps(bookingId, start.minusMinutes(30 + rnd.nextInt(60)), paidAt, cancelledAt);
        return new CreatedSlot(bookingId, start, end);
    }

    private Booking buildBooking(SeedContext ctx, Long activityId, LocalDateTime start, LocalDateTime end,
                                 String name, String phone) {
        Booking booking = new Booking();
        Restaurant branch = restaurantRepository.findById(ctx.restaurantId()).orElseThrow();
        booking.setBranch(branch);
        Activity act = new Activity();
        act.setId(activityId);
        booking.setActivity(act);
        booking.setCustomerName(name);
        booking.setCustomerPhone(phone);
        booking.setStartAt(start);
        booking.setEndAt(end);
        return booking;
    }

    private void patchTimestamps(Long id, LocalDateTime createdAt, LocalDateTime paidAt, LocalDateTime cancelledAt) {
        bookingRepository.updateBookingTimestamps(id, createdAt, paidAt, cancelledAt);
    }

    private Long pickActivity(SeedContext ctx, SeedScenario scenario, ThreadLocalRandom rnd) {
        if (scenario == SeedScenario.STOP_CHECK || scenario == SeedScenario.GAP_FILLER) {
            return ctx.visitActivityId();
        }
        int roll = rnd.nextInt(100);
        if (roll < 15 && ctx.cinemaActivityId() != null) {
            return ctx.cinemaActivityId();
        }
        if (roll < 30 && ctx.billiardActivityId() != null) {
            return ctx.billiardActivityId();
        }
        if (roll < 55 && ctx.karaokeActivityId() != null) {
            return ctx.karaokeActivityId();
        }
        if (roll < 75 && ctx.bowlingActivityId() != null) {
            return ctx.bowlingActivityId();
        }
        if (ctx.vrActivityId() != null) {
            return ctx.vrActivityId();
        }
        return pickNonVisitActivity(ctx, rnd);
    }

    private Long pickNonVisitActivity(SeedContext ctx, ThreadLocalRandom rnd) {
        List<Long> ids = new ArrayList<>();
        if (ctx.cinemaActivityId() != null) ids.add(ctx.cinemaActivityId());
        if (ctx.billiardActivityId() != null) ids.add(ctx.billiardActivityId());
        if (ctx.karaokeActivityId() != null) ids.add(ctx.karaokeActivityId());
        if (ctx.bowlingActivityId() != null) ids.add(ctx.bowlingActivityId());
        if (ctx.vrActivityId() != null) ids.add(ctx.vrActivityId());
        if (ids.isEmpty()) {
            return null;
        }
        return ids.get(rnd.nextInt(ids.size()));
    }

    private static SeedScenario pickScenario(ThreadLocalRandom rnd) {
        int r = rnd.nextInt(100);
        if (r < 22) return SeedScenario.BOOKING_ORDER_GROUP;
        if (r < 42) return SeedScenario.STANDARD_WEEKDAY;
        if (r < 54) return SeedScenario.WEEKEND;
        if (r < 66) return SeedScenario.HOLIDAY;
        if (r < 73) return SeedScenario.OVERNIGHT;
        if (r < 76) return SeedScenario.MULTI_DAY;
        if (r < 84) return SeedScenario.DISCOUNT;
        if (r < 88) return SeedScenario.GAP_FILLER;
        if (r < 90) return SeedScenario.STOP_CHECK;
        if (r < 93) return SeedScenario.CANCELLED;
        if (r < 96) return SeedScenario.DRAFT;
        return SeedScenario.PAID_CONFIRMED;
    }

    private LocalDateTime randomStartForActivity(
        SeedContext ctx,
        Long activityId,
        int daysBack,
        LocalDateTime now,
        ThreadLocalRandom rnd
    ) {
        PlanHours h = resolveHours(ctx, activityId);
        int dayOffset;
        if (rnd.nextInt(100) < 40) {
            dayOffset = rnd.nextInt(Math.min(30, Math.max(1, daysBack)));
        } else {
            dayOffset = rnd.nextInt(Math.max(1, daysBack));
        }
        LocalDate day = now.toLocalDate().minusDays(dayOffset);
        int minute = quarterMinute(rnd);
        if (h.overnight()) {
            if (rnd.nextBoolean()) {
                int hour = Math.min(22, h.from().getHour() + rnd.nextInt(5));
                return day.atTime(hour, minute);
            }
            return day.plusDays(1).atTime(rnd.nextInt(3), minute);
        }
        int fromHour = h.from().getHour();
        int toHour = h.to().getHour();
        int latestStart = Math.max(fromHour, toHour - 2);
        int span = Math.max(1, latestStart - fromHour + 1);
        int hour = fromHour + rnd.nextInt(span);
        return day.atTime(hour, minute);
    }

    private static LocalDateTime fitEndToWindow(SeedContext ctx, Long activityId, LocalDateTime start, LocalDateTime proposedEnd) {
        PlanHours h = resolveHours(ctx, activityId);
        LocalDateTime windowEnd = windowEndForStart(start, h);
        LocalDateTime end = proposedEnd;
        if (end.isAfter(windowEnd)) {
            end = windowEnd;
        }
        if (!end.isAfter(start)) {
            end = start.plusMinutes(90);
            if (end.isAfter(windowEnd)) {
                end = windowEnd;
            }
        }
        if (!end.isAfter(start)) {
            end = start.plusMinutes(30);
        }
        return end.withSecond(0).withNano(0);
    }

    private static LocalDateTime windowEndForStart(LocalDateTime start, PlanHours h) {
        if (h.overnight()) {
            if (start.toLocalTime().isBefore(h.from())) {
                return start.toLocalDate().atTime(h.to());
            }
            return start.toLocalDate().plusDays(1).atTime(h.to());
        }
        return start.toLocalDate().atTime(h.to());
    }

    private static LocalDateTime alignStartToActivityHours(SeedContext ctx, Long activityId, LocalDateTime candidate) {
        PlanHours h = resolveHours(ctx, activityId);
        LocalTime t = candidate.toLocalTime();
        if (h.overnight()) {
            if (!t.isBefore(h.from()) || t.isBefore(h.to())) {
                return candidate.withSecond(0).withNano(0);
            }
            return candidate.with(h.from());
        }
        if (t.isBefore(h.from())) {
            return candidate.with(h.from());
        }
        if (t.isAfter(h.to().minusHours(1))) {
            return candidate.with(h.to().minusHours(2));
        }
        return candidate.withSecond(0).withNano(0);
    }

    private static PlanHours resolveHours(SeedContext ctx, Long activityId) {
        if (Objects.equals(activityId, ctx.karaokeActivityId())) {
            return ctx.karaokeHours();
        }
        if (Objects.equals(activityId, ctx.bowlingActivityId())) {
            return ctx.bowlingHours();
        }
        if (Objects.equals(activityId, ctx.vrActivityId())) {
            return ctx.vrHours();
        }
        return PlanHours.defaults();
    }

    private static int quarterMinute(ThreadLocalRandom rnd) {
        return rnd.nextInt(4) * 15;
    }

    private static LocalDateTime nextWeekend(LocalDateTime t) {
        LocalDate d = t.toLocalDate();
        while (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
            d = d.plusDays(1);
        }
        return LocalDateTime.of(d, t.toLocalTime());
    }

    private static LocalDateTime nextWeekday(LocalDateTime t) {
        LocalDate d = t.toLocalDate();
        while (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) {
            d = d.plusDays(1);
        }
        return LocalDateTime.of(d, t.toLocalTime());
    }

    private static List<LocalDate> randomSpecialDates(int daysBack, int count, ThreadLocalRandom rnd) {
        Set<LocalDate> dates = new TreeSet<>();
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(daysBack);
        while (dates.size() < count) {
            long span = Math.max(1, end.toEpochDay() - start.toEpochDay());
            dates.add(start.plusDays(rnd.nextLong(span + 1)));
        }
        return new ArrayList<>(dates);
    }

    private void applyKaraokeModifiers(Long planId, List<LocalDate> specials) {
        Map<LocalDate, Map<String, Object>> map = new HashMap<>();
        for (int i = 0; i < specials.size(); i++) {
            LocalDate d = specials.get(i);
            Map<String, Object> m = new HashMap<>();
            switch (i % 3) {
                case 0 -> {
                    m.put("modifierType", "PERCENT_INCREASE");
                    m.put("modifierValue", 10);
                }
                case 1 -> {
                    m.put("modifierType", "PERCENT_DECREASE");
                    m.put("modifierValue", 5);
                }
                default -> {
                    m.put("modifierType", "FIXED_INCREASE");
                    m.put("modifierValue", 500);
                }
            }
            map.put(d, m);
        }
        modifierService.upsertModifiers(planId, map);
    }

    private void applyBowlingModifiers(Long planId, List<LocalDate> specials) {
        Map<LocalDate, Map<String, Object>> map = new HashMap<>();
        for (int i = 0; i < specials.size(); i++) {
            LocalDate d = specials.get(i);
            Map<String, Object> m = new HashMap<>();
            m.put("modifierType", "PERCENT_INCREASE");
            m.put("modifierValue", 8);
            if (i < 3) {
                m.put("bookingTimeFrom", "14:00");
                m.put("bookingTimeTo", "18:00");
            }
            map.put(d, m);
        }
        modifierService.upsertModifiers(planId, map);
    }

    private void applyVrModifiers(Long planId, List<LocalDate> specials) {
        Map<LocalDate, Map<String, Object>> map = new HashMap<>();
        for (LocalDate d : specials) {
            Map<String, Object> m = new HashMap<>();
            m.put("modifierType", rndModifierDecrease());
            m.put("modifierValue", 10 + ThreadLocalRandom.current().nextInt(10));
            map.put(d, m);
        }
        modifierService.upsertModifiers(planId, map);
    }

    private static String rndModifierDecrease() {
        return ThreadLocalRandom.current().nextBoolean() ? "PERCENT_DECREASE" : "FIXED_DECREASE";
    }

    private void createRule(Long planId, TariffRule.RuleType type, int order, String formula, String conditions) {
        TariffRule rule = new TariffRule();
        rule.setRuleType(type);
        rule.setRuleOrder(order);
        rule.setPricingFormula(formula);
        rule.setConditions(conditions);
        rule.setIsActive(true);
        tariffService.createTariffRule(planId, rule);
    }

    private static String holidayCondition(LocalDate d) {
        return "{\"date\":\"" + d + "\"}";
    }

    private static Map<String, Object> interval(String from, String to, int ratePerHour) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("timeFrom", from);
        m.put("timeTo", to);
        m.put("rate", ratePerHour);
        return m;
    }

    static String serializeTimeBasedFormula(Map<String, Object>... intervals) throws JsonProcessingException {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("model", "TIME_BASED");
        root.put("intervals", List.of(intervals));
        return new ObjectMapper().writeValueAsString(root);
    }

    private String timeBasedJson(Map<String, Object>... intervals) {
        try {
            return serializeTimeBasedFormula(intervals);
        } catch (JsonProcessingException e) {
            throw new BusinessException("Invalid TIME_BASED formula: " + e.getMessage());
        }
    }

    private String perHourJson(int rate) {
        try {
            return objectMapper.writeValueAsString(Map.of("model", "PER_HOUR", "rate", rate));
        } catch (JsonProcessingException e) {
            throw new BusinessException(e.getMessage());
        }
    }

    private String perMinuteJson(int rate) {
        try {
            return objectMapper.writeValueAsString(Map.of("model", "PER_MINUTE", "rate", rate));
        } catch (JsonProcessingException e) {
            throw new BusinessException(e.getMessage());
        }
    }

    private static Long findActivityId(List<Activity> all, String... keywords) {
        for (Activity a : all) {
            if (a.getName() == null || a.getName().startsWith(PREFIX)) {
                continue;
            }
            String n = a.getName().toLowerCase(Locale.ROOT);
            for (String k : keywords) {
                if (n.contains(k.toLowerCase(Locale.ROOT))) {
                    return a.getId();
                }
            }
        }
        return null;
    }

    private static Activity findByPrefixName(List<Activity> all, String exactName) {
        return all.stream()
            .filter(a -> exactName.equals(a.getName()))
            .findFirst()
            .orElse(null);
    }

    private static List<LocalDate> specialDatesForActivity(SeedContext ctx, Long activityId) {
        if (Objects.equals(activityId, ctx.karaokeActivityId())) {
            return ctx.karaokeSpecialDates();
        }
        if (Objects.equals(activityId, ctx.bowlingActivityId())) {
            return ctx.bowlingSpecialDates();
        }
        if (Objects.equals(activityId, ctx.vrActivityId())) {
            return ctx.vrSpecialDates();
        }
        return List.of();
    }

    private static void trackExisting(Map<String, Integer> map, SeedContext ctx, Long activityId) {
        String key = "other";
        if (Objects.equals(activityId, ctx.cinemaActivityId())) {
            key = "cinema";
        } else if (Objects.equals(activityId, ctx.billiardActivityId())) {
            key = "billiard";
        } else if (Objects.equals(activityId, ctx.visitActivityId())) {
            key = "visit";
        }
        bump(map, key);
    }

    private static void bump(Map<String, Integer> map, String key) {
        map.merge(key, 1, Integer::sum);
    }

    private record ClientIdentity(String name, String phone) {}

    /** ~30% of single-booking rows reuse a fixed pool so some retention appears in analytics. */
    private static ClientIdentity pooledClient(ThreadLocalRandom rnd) {
        if (rnd.nextInt(100) < 30) {
            int id = 1 + rnd.nextInt(REPEAT_CLIENT_POOL_SIZE);
            return repeatPoolClient(id);
        }
        return new ClientIdentity(clientName(rnd), clientPhone(rnd));
    }

    private static ClientIdentity repeatPoolClient(int id) {
        return new ClientIdentity(CLIENT_PREFIX + id, "+7903" + String.format("%07d", id));
    }

    private static ClientIdentity retentionClient(int id) {
        return new ClientIdentity(RETENTION_CLIENT_PREFIX + id, "+7902" + String.format("%07d", id));
    }

    private static int cohortRetentionPercent(int weekOffset) {
        return switch (weekOffset) {
            case 1 -> 58;
            case 2 -> 44;
            case 3 -> 34;
            case 4 -> 28;
            case 5, 6, 7 -> 20;
            case 8, 9, 10 -> 14;
            default -> 10;
        };
    }

    private static LocalDate randomCohortMonday(int daysBack, LocalDate today, ThreadLocalRandom rnd) {
        LocalDate latestMonday = today.with(DayOfWeek.MONDAY);
        int maxWeeks = Math.max(4, daysBack / 7);
        int weeksBack = 2 + rnd.nextInt(Math.max(1, maxWeeks - 2));
        return latestMonday.minusWeeks(weeksBack);
    }

    private LocalDateTime randomStartOnDay(SeedContext ctx, Long activityId, LocalDate day, ThreadLocalRandom rnd) {
        PlanHours h = resolveHours(ctx, activityId);
        int minute = quarterMinute(rnd);
        if (h.overnight()) {
            if (rnd.nextBoolean()) {
                int hour = Math.min(22, h.from().getHour() + rnd.nextInt(5));
                return day.atTime(hour, minute);
            }
            return day.plusDays(1).atTime(rnd.nextInt(3), minute);
        }
        int fromHour = h.from().getHour();
        int toHour = h.to().getHour();
        int latestStart = Math.max(fromHour, toHour - 2);
        int span = Math.max(1, latestStart - fromHour + 1);
        int hour = fromHour + rnd.nextInt(span);
        return day.atTime(hour, minute);
    }

    private static String clientName(ThreadLocalRandom rnd) {
        return CLIENT_PREFIX + (1 + rnd.nextInt(99999));
    }

    private static String clientPhone(ThreadLocalRandom rnd) {
        return "+7900" + String.format("%07d", rnd.nextInt(10_000_000));
    }

    private enum SeedScenario {
        STANDARD_WEEKDAY,
        WEEKEND,
        HOLIDAY,
        OVERNIGHT,
        MULTI_DAY,
        DISCOUNT,
        GAP_FILLER,
        STOP_CHECK,
        CANCELLED,
        DRAFT,
        BOOKING_ORDER_GROUP,
        PAID_CONFIRMED
    }

    private record PlanHours(LocalTime from, LocalTime to, boolean overnight) {
        static PlanHours defaults() {
            return new PlanHours(LocalTime.of(12, 0), LocalTime.of(22, 0), false);
        }
    }

    private record SeedContext(
        Long restaurantId,
        int activitiesCreated,
        Long cinemaActivityId,
        Long billiardActivityId,
        Long visitActivityId,
        Long karaokeActivityId,
        Long bowlingActivityId,
        Long vrActivityId,
        List<LocalDate> karaokeSpecialDates,
        List<LocalDate> bowlingSpecialDates,
        List<LocalDate> vrSpecialDates,
        PlanHours karaokeHours,
        PlanHours bowlingHours,
        PlanHours vrHours
    ) {}
}
