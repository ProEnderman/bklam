package com.restaurant.service;

import com.restaurant.dto.BookingNotificationDto;
import com.restaurant.dto.ResolveNotificationRequest;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Booking;
import com.restaurant.model.BookingNotification;
import com.restaurant.model.BookingNotification.*;
import com.restaurant.repository.ActivityRepository;
import com.restaurant.repository.BookingNotificationRepository;
import com.restaurant.repository.BookingRepository;
import com.restaurant.security.SecurityUtils;
import com.restaurant.tenant.TenantContext;
import com.restaurant.util.TimeUtils;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.restaurant.model.Activity;
import com.restaurant.model.PricingRun;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.jdbc.BadSqlGrammarException;

@Slf4j
@Service
public class BookingNotificationService {

    private final JdbcTemplate platformJdbcTemplate;
    private final BookingNotificationRepository notificationRepository;
    private final BookingRepository bookingRepository;
    private final ActivityRepository activityRepository;
    private final PricingService pricingService;

    public BookingNotificationService(
            @Qualifier("platformJdbcTemplate") JdbcTemplate platformJdbcTemplate,
            BookingNotificationRepository notificationRepository,
            BookingRepository bookingRepository,
            ActivityRepository activityRepository,
            PricingService pricingService) {
        this.platformJdbcTemplate = platformJdbcTemplate;
        this.notificationRepository = notificationRepository;
        this.bookingRepository = bookingRepository;
        this.activityRepository = activityRepository;
        this.pricingService = pricingService;
    }

    /**
     * Restaurant IDs for scheduled jobs (no request context).
     * Intentional cross-tenant read — {@code restaurants} is the global catalog; not used to leak orders/dishes.
     */
    private List<Long> getAllRestaurantIds() {
        try {
            return platformJdbcTemplate.query("SELECT id FROM restaurants", (rs, i) -> rs.getLong("id"));
        } catch (BadSqlGrammarException e) {
            if (e.getCause() != null && e.getCause().getMessage() != null && e.getCause().getMessage().contains("does not exist")) {
                log.trace("Skipping booking notifications: restaurants table not present (incomplete schema)");
                return Collections.emptyList();
            }
            throw e;
        }
    }

    /* ===================================================================
     * REST helpers
     * =================================================================== */

    /**
     * Получить все PENDING уведомления для текущего ресторана
     */
    @Transactional(readOnly = true)
    public List<BookingNotificationDto> getPending() {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        return notificationRepository.findByRestaurantIdAndStatus(restaurantId, NotificationStatus.PENDING)
            .stream()
            .peek(this::initLazy)
            .map(BookingNotificationDto::fromEntity)
            .collect(Collectors.toList());
    }

    /**
     * Получить все уведомления (PENDING + RESOLVED)
     */
    @Transactional(readOnly = true)
    public List<BookingNotificationDto> getAll() {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        return notificationRepository.findByRestaurantId(restaurantId)
            .stream()
            .peek(this::initLazy)
            .map(BookingNotificationDto::fromEntity)
            .collect(Collectors.toList());
    }

    /**
     * Подсчитать количество PENDING уведомлений
     */
    @Transactional(readOnly = true)
    public long countPending() {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        return notificationRepository.countPending(restaurantId);
    }

    /**
     * Обработать уведомление — пользователь выбрал ответ
     */
    @Transactional
    public BookingNotificationDto resolve(Long notificationId, ResolveNotificationRequest req) {
        BookingNotification notification = notificationRepository.findById(notificationId)
            .orElseThrow(() -> new ResourceNotFoundException("Notification not found"));

        if (notification.getStatus() == NotificationStatus.RESOLVED) {
            throw new BusinessException("Notification already resolved");
        }

        NotificationResponse responseEnum;
        try {
            responseEnum = NotificationResponse.valueOf(req.response());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("Invalid response: " + req.response());
        }

        // Загружаем бронирование
        Booking booking = notification.getBooking();
        if (booking == null) {
            throw new BusinessException("Related booking not found");
        }

        // Обработка по типу
        switch (notification.getNotificationType()) {
            case REMINDER -> handleReminderResponse(booking, responseEnum);
            case OVERDUE -> handleOverdueResponse(booking, responseEnum, req.newEndAt(), req.activityId());
            case GAP -> { /* GAP notifications removed — ignore old ones */ }
        }

        // Обновляем уведомление
        notification.setResponse(responseEnum);
        notification.setStatus(NotificationStatus.RESOLVED);
        notification.setResolvedAt(TimeUtils.now());
        var user = SecurityUtils.getCurrentUser();
        notification.setResolvedBy(user != null ? user.getUsername() : "system");

        notificationRepository.save(notification);
        initLazy(notification);
        return BookingNotificationDto.fromEntity(notification);
    }

    private void handleReminderResponse(Booking booking, NotificationResponse response) {
        switch (response) {
            case CONFIRMED -> {
                booking.setStatus(Booking.BookingStatus.CONFIRMED);
                bookingRepository.save(booking);
                log.info("Booking #{} confirmed by reminder response", booking.getId());
            }
            case CANCELLED -> {
                booking.setStatus(Booking.BookingStatus.CANCELLED);
                booking.setCancelledAt(TimeUtils.now());
                bookingRepository.save(booking);
                log.info("Booking #{} cancelled by reminder response", booking.getId());
            }
            default -> throw new BusinessException(
                "Invalid response for REMINDER: " + response + ". Expected CONFIRMED or CANCELLED");
        }
    }

    private void handleOverdueResponse(Booking booking, NotificationResponse response, String newEndAt, Long activityId) {
        switch (response) {
            case CONTINUES -> {
                // Клиент продолжает — обновляем время окончания
                if (newEndAt == null || newEndAt.isBlank()) {
                    throw new BusinessException("Укажите новое время окончания (newEndAt)");
                }
                LocalDateTime newEnd = LocalDateTime.parse(newEndAt);

                if (activityId != null && !activityId.equals(booking.getActivity().getId())) {
                    // Клиент переключился на другую услугу — создаём новое бронирование
                    var activity = activityRepository.findById(activityId)
                        .orElseThrow(() -> new BusinessException("Активность не найдена (id=" + activityId + ")"));

                    // ── Расчёт цены с учётом стоп-чека ──
                    BigDecimal totalAmount = BigDecimal.ZERO;
                    String stopCheckNote = "";
                    LocalDateTime billingStart = booking.getEndAt();
                    LocalDateTime billingEnd = newEnd;

                    if (activity.getGapFiller() != null && activity.getGapFiller()
                            && activity.getStopCheckHours() != null && activity.getStopCheckHours() > 0) {
                        // Определяем первое время начала посещения клиента
                        LocalDateTime firstStart = findCustomerFirstStart(booking);
                        double stopCheckMin = activity.getStopCheckHours() * 60;
                        double minutesSinceArrival = Duration.between(firstStart, billingStart).toMinutes();
                        double minutesAtEnd = Duration.between(firstStart, billingEnd).toMinutes();

                        log.info("[OVERDUE CONTINUES] stopCheck: firstStart={}, stopCheckMin={}, minutesSinceArrival={}, minutesAtEnd={}",
                            firstStart, stopCheckMin, minutesSinceArrival, minutesAtEnd);

                        if (minutesSinceArrival >= stopCheckMin) {
                            // Полностью за порогом стоп-чека — бесплатно
                            totalAmount = BigDecimal.ZERO;
                            stopCheckNote = " [стоп-чек — бесплатно]";
                            log.info("[OVERDUE CONTINUES] Fully past stop-check, amount=0");
                        } else if (minutesAtEnd > stopCheckMin) {
                            // Частично: считаем только до порога стоп-чека
                            billingEnd = firstStart.plusMinutes((long) stopCheckMin);
                            stopCheckNote = " [стоп-чек " + activity.getStopCheckHours() + " ч — частично]";
                            totalAmount = calculateGapFillerPrice(activity, billingStart, billingEnd);
                            log.info("[OVERDUE CONTINUES] Partial stop-check, billing until {}, amount={}", billingEnd, totalAmount);
                        } else {
                            // Стоп-чек ещё не достигнут — обычная цена
                            totalAmount = calculateGapFillerPrice(activity, billingStart, billingEnd);
                            log.info("[OVERDUE CONTINUES] No stop-check yet, amount={}", totalAmount);
                        }
                    } else {
                        // Обычная активность или нет стоп-чека — стандартный расчёт
                        totalAmount = calculateGapFillerPrice(activity, billingStart, billingEnd);
                    }

                    Booking newBooking = new Booking();
                    newBooking.setActivity(activity);
                    newBooking.setBranch(booking.getBranch());
                    newBooking.setOrganizationId(booking.getOrganizationId());
                    newBooking.setStartAt(booking.getEndAt());
                    newBooking.setEndAt(newEnd);
                    newBooking.setCustomerName(booking.getCustomerName());
                    newBooking.setCustomerPhone(booking.getCustomerPhone());
                    newBooking.setCustomer(booking.getCustomer());
                    newBooking.setStatus(Booking.BookingStatus.CONFIRMED);
                    newBooking.setTotalAmount(totalAmount);
                    newBooking.setNotes("Продолжение: " + activity.getName()
                        + (activity.getGapFiller() != null && activity.getGapFiller() ? " (посещение)" : "")
                        + stopCheckNote);
                    bookingRepository.save(newBooking);
                    log.info("Created new booking #{} for activity '{}' ({} → {}), amount={}, as CONTINUES from booking #{}",
                        newBooking.getId(), activity.getName(), booking.getEndAt(), newEnd, totalAmount, booking.getId());
                } else {
                    // Та же услуга — продлеваем и пересчитываем цену
                    LocalDateTime oldEnd = booking.getEndAt();
                    booking.setEndAt(newEnd);

                    // Пересчитываем цену для расширенного периода
                    try {
                        BigDecimal newTotal = calculateGapFillerPrice(
                            booking.getActivity(), booking.getStartAt(), newEnd);
                        booking.setTotalAmount(newTotal);
                        log.info("Booking #{} extended to {}, price recalculated: {} → {}",
                            booking.getId(), newEnd, oldEnd, newTotal);
                    } catch (Exception e) {
                        log.warn("Failed to recalculate price for extended booking #{}: {}",
                            booking.getId(), e.getMessage());
                    }

                    bookingRepository.save(booking);
                    log.info("Booking #{} extended to {} (CONTINUES, same activity)", booking.getId(), newEnd);
                }
            }
            case PAID_OR_CANCELLED -> {
                // Бронь считается отменённой (оплачена или отменена — закрываем)
                booking.setStatus(Booking.BookingStatus.CANCELLED);
                booking.setCancelledAt(TimeUtils.now());
                bookingRepository.save(booking);
                log.info("Booking #{} marked as CANCELLED (PAID_OR_CANCELLED)", booking.getId());
            }
            default -> throw new BusinessException(
                "Invalid response for OVERDUE: " + response + ". Expected CONTINUES or PAID_OR_CANCELLED");
        }
    }

    /**
     * Находит время начала первого бронирования клиента за сегодня.
     * Используется для расчёта стоп-чека (общее время пребывания).
     */
    private LocalDateTime findCustomerFirstStart(Booking booking) {
        String customerName = booking.getCustomerName();
        if (customerName == null || customerName.isBlank()) {
            return booking.getStartAt();
        }

        LocalDateTime todayStart = TimeUtils.today().atStartOfDay();
        LocalDateTime todayEnd = TimeUtils.today().atTime(LocalTime.MAX);

        List<Booking> todayBookings = bookingRepository.findBookings(
            null, null, null, todayStart, todayEnd);

        return todayBookings.stream()
            .filter(b -> customerName.equalsIgnoreCase(b.getCustomerName()))
            .map(Booking::getStartAt)
            .min(LocalDateTime::compareTo)
            .orElse(booking.getStartAt());
    }

    /**
     * Рассчитывает цену gap-filler бронирования через PricingService.
     * Если расчёт невозможен (нет тарифного плана и т.д.), возвращает ZERO.
     */
    private BigDecimal calculateGapFillerPrice(Activity activity, LocalDateTime start, LocalDateTime end) {
        if (start.isEqual(end) || start.isAfter(end)) {
            return BigDecimal.ZERO;
        }
        try {
            PricingService.PricingRequest req = new PricingService.PricingRequest();
            req.setServiceId(activity.getId());
            req.setRestaurantId(activity.getBranch() != null ? activity.getBranch().getId() : null);
            req.setServiceStart(start);
            req.setServiceEnd(end);
            PricingService.PricingResult result = pricingService.preview(req);
            if (result.getStatus() == PricingRun.PricingStatus.OK) {
                return result.getTotalAmount() != null ? result.getTotalAmount() : BigDecimal.ZERO;
            }
            log.warn("Pricing preview returned status={} for activity {} ({} → {})",
                result.getStatus(), activity.getName(), start, end);
            return BigDecimal.ZERO;
        } catch (Exception e) {
            log.warn("Failed to calculate price for activity {} ({} → {}): {}",
                activity.getName(), start, end, e.getMessage());
            return BigDecimal.ZERO;
        }
    }

    /* ===================================================================
     * SCHEDULER — автоматическое создание уведомлений
     * =================================================================== */

    /**
     * Каждые 10 минут: проверяем бронирования, которые начинаются завтра.
     * Scheduler thread has no TenantContext; run per-tenant.
     */
    @Scheduled(fixedRate = 600_000) // 10 минут
    @SchedulerLock(name = "BookingNotifications.reminders", lockAtLeastFor = "8m", lockAtMostFor = "9m")
    public void createReminderNotifications() {
        for (Long restaurantId : getAllRestaurantIds()) {
            TenantContext.set(restaurantId);
            try {
                createReminderNotificationsNow();
            } finally {
                TenantContext.clear();
            }
        }
    }

    /**
     * Каждые 5 минут: проверяем просроченные бронирования.
     * Scheduler thread has no TenantContext; run per-tenant.
     */
    @Scheduled(fixedRate = 300_000) // 5 минут
    @SchedulerLock(name = "BookingNotifications.overdue", lockAtLeastFor = "4m", lockAtMostFor = "PT4M30S")
    public void createOverdueNotifications() {
        for (Long restaurantId : getAllRestaurantIds()) {
            TenantContext.set(restaurantId);
            try {
                createOverdueNotificationsNow();
            } finally {
                TenantContext.clear();
            }
        }
    }

    /**
     * Проверяем бронирования, которые начинаются завтра.
     * Если уведомление REMINDER ещё не создано — создаём.
     * Может вызываться и по расписанию, и вручную.
     */
    @Transactional
    public int createReminderNotificationsNow() {
        LocalDate tomorrow = TimeUtils.today().plusDays(1);
        LocalDateTime tomorrowStart = tomorrow.atStartOfDay();
        LocalDateTime tomorrowEnd = tomorrow.atTime(LocalTime.MAX);

        List<Booking.BookingStatus> activeStatuses = Arrays.asList(
            Booking.BookingStatus.CONFIRMED, Booking.BookingStatus.DRAFT
        );

        List<Booking> tomorrowBookings = bookingRepository.findBookingsWithActivityFetch(
            null, null, null, tomorrowStart, tomorrowEnd
        );

        int created = 0;
        for (Booking booking : tomorrowBookings) {
            if (!activeStatuses.contains(booking.getStatus())) continue;
            if (isGapFillerBooking(booking)) continue; // Посещения-филлеры не показываем в уведомлениях
            if (notificationRepository.existsByBookingIdAndType(booking.getId(), NotificationType.REMINDER)) {
                continue;
            }

            BookingNotification notification = new BookingNotification();
            notification.setRestaurantId(booking.getBranchId());
            notification.setBooking(booking);
            notification.setNotificationType(NotificationType.REMINDER);
            notification.setTitle("Подтверждение брони на завтра");
            notification.setMessage(String.format(
                "У клиента %s (%s) завтра бронь \"%s\" с %s до %s. Уточните, актуальна ли бронь.",
                booking.getCustomerName() != null ? booking.getCustomerName() : "—",
                booking.getCustomerPhone() != null ? booking.getCustomerPhone() : "—",
                booking.getActivity() != null ? booking.getActivity().getName() : "—",
                booking.getStartAt().toLocalTime(),
                booking.getEndAt().toLocalTime()
            ));
            notification.setStatus(NotificationStatus.PENDING);
            notification.setCreatedAt(TimeUtils.now());

            notificationRepository.save(notification);
            created++;
            log.info("Created REMINDER notification for booking #{} (tomorrow={})", booking.getId(), tomorrow);
        }
        if (created > 0) {
            log.info("Created {} REMINDER notifications (virtualNow={})", created, TimeUtils.now());
        }
        return created;
    }

    /**
     * Проверяем бронирования, которые закончились 5+ минут назад,
     * но статус всё ещё CONFIRMED. OVERDUE создаётся только для
     * ПОСЛЕДНЕЙ брони клиента за день.
     * Может вызываться и по расписанию, и вручную.
     */
    @Transactional
    public int createOverdueNotificationsNow() {
        LocalDateTime virtualNow = TimeUtils.now();
        LocalDateTime overdueThreshold = virtualNow.minusMinutes(5);

        log.info("Checking overdue: virtualNow={}, overdueThreshold={}", virtualNow, overdueThreshold);

        // Загружаем все бронирования за сегодня + вчера (с activity для сообщения — избегаем LazyInit)
        List<Booking> allRecent = bookingRepository.findBookingsWithActivityFetch(
            null, null, null,
            TimeUtils.today().atStartOfDay().minusDays(1),
            TimeUtils.today().atTime(LocalTime.MAX)
        );

        log.info("Found {} bookings in range for overdue check", allRecent.size());

        List<Booking.BookingStatus> overdueStatuses = Arrays.asList(
            Booking.BookingStatus.CONFIRMED, Booking.BookingStatus.DRAFT
        );

        // Группируем по клиенту для определения "последней брони"
        Map<String, List<Booking>> byCustomer = groupByCustomer(allRecent);

        int created = 0;
        for (Booking booking : allRecent) {
            if (!overdueStatuses.contains(booking.getStatus())) continue;
            if (isGapFillerBooking(booking)) continue; // Посещения-филлеры не показываем в уведомлениях
            if (booking.getEndAt().isAfter(overdueThreshold)) continue;
            if (notificationRepository.existsByBookingIdAndType(booking.getId(), NotificationType.OVERDUE)) continue;

            // Проверяем: это последняя бронь клиента за день?
            String customerKey = buildCustomerKey(booking);
            List<Booking> customerBookings = byCustomer.getOrDefault(customerKey, List.of());
            boolean isLastBooking = isLastActiveBookingOfCustomer(booking, customerBookings);

            if (!isLastBooking) {
                log.debug("Skipping OVERDUE for booking #{} — not the last booking of customer '{}'",
                    booking.getId(), customerKey);
                continue;
            }

            BookingNotification notification = new BookingNotification();
            notification.setRestaurantId(booking.getBranchId());
            notification.setBooking(booking);
            notification.setNotificationType(NotificationType.OVERDUE);
            notification.setTitle("Бронь просрочена — нет оплаты");
            notification.setMessage(String.format(
                "Клиент %s (%s), бронь \"%s\" %s–%s завершилась, но заказ не оформлен. " +
                "Продолжает ли клиент пользоваться услугой или бронь была оплачена/отменена?",
                booking.getCustomerName() != null ? booking.getCustomerName() : "—",
                booking.getCustomerPhone() != null ? booking.getCustomerPhone() : "—",
                booking.getActivity() != null ? booking.getActivity().getName() : "—",
                booking.getStartAt().toLocalTime(),
                booking.getEndAt().toLocalTime()
            ));
            notification.setStatus(NotificationStatus.PENDING);
            notification.setCreatedAt(TimeUtils.now());

            notificationRepository.save(notification);
            created++;
            log.info("Created OVERDUE notification for booking #{} (last booking of customer, ended at {})",
                booking.getId(), booking.getEndAt());
        }
        if (created > 0) {
            log.info("Created {} OVERDUE notifications (virtualNow={})", created, virtualNow);
        } else {
            log.info("No new OVERDUE notifications needed (virtualNow={}, checked {} bookings)", virtualNow, allRecent.size());
        }
        return created;
    }

    /** Бронь создана как филлер (автозаполнение пробела / пребывание до оплаты), а не как отдельная бронь. Такие не показываем в уведомлениях. */
    private boolean isGapFillerBooking(Booking booking) {
        if (booking.getActivity() == null || !Boolean.TRUE.equals(booking.getActivity().getGapFiller())) {
            return false;
        }
        String notes = booking.getNotes();
        return notes != null && (notes.contains("Автозаполнение пробела") || notes.contains("Пребывание до оплаты"));
    }

    /* ===================================================================
     * AUTO-RESOLVE — автоматическое закрытие неактуальных уведомлений
     * =================================================================== */

    /**
     * Каждые 2 минуты: закрываем PENDING уведомления, если бронирование
     * уже оплачено, отменено или завершено.
     * Scheduler thread has no TenantContext; run per-tenant.
     */
    @Scheduled(fixedRate = 120_000) // 2 минуты
    @SchedulerLock(name = "BookingNotifications.autoResolve", lockAtLeastFor = "90s", lockAtMostFor = "110s")
    public void autoResolveNotifications() {
        for (Long restaurantId : getAllRestaurantIds()) {
            TenantContext.set(restaurantId);
            try {
                autoResolveNotificationsNow();
            } finally {
                TenantContext.clear();
            }
        }
    }

    /**
     * Автоматически закрывает PENDING уведомления, если связанное бронирование
     * уже в статусе PAID, CANCELLED или COMPLETED.
     * Может вызываться по расписанию и вручную.
     */
    @Transactional
    public int autoResolveNotificationsNow() {
        List<BookingNotification> pending = notificationRepository.findAllPending();
        int resolved = 0;

        for (BookingNotification notification : pending) {
            Booking booking = notification.getBooking();
            if (booking == null) continue;

            Booking.BookingStatus status = booking.getStatus();
            boolean shouldResolve = false;
            String reason = null;

            if (status == Booking.BookingStatus.PAID) {
                shouldResolve = true;
                reason = "AUTO_PAID";
            } else if (status == Booking.BookingStatus.CANCELLED) {
                shouldResolve = true;
                reason = "AUTO_CANCELLED";
            } else if (status == Booking.BookingStatus.COMPLETED) {
                shouldResolve = true;
                reason = "AUTO_COMPLETED";
            }

            if (shouldResolve) {
                notification.setStatus(NotificationStatus.RESOLVED);
                notification.setResolvedAt(TimeUtils.now());
                notification.setResolvedBy("system");
                notification.setResponse(NotificationResponse.PAID_OR_CANCELLED);
                notificationRepository.save(notification);
                resolved++;
                log.info("Auto-resolved {} notification #{} for booking #{} (status={})",
                    notification.getNotificationType(), notification.getId(),
                    booking.getId(), reason);
            }
        }

        if (resolved > 0) {
            log.info("Auto-resolved {} stale notifications", resolved);
        }
        return resolved;
    }

    /**
     * Закрыть все PENDING уведомления для конкретного бронирования.
     * Вызывается при оплате / отмене бронирования.
     */
    @Transactional
    public void autoResolveForBooking(Long bookingId) {
        List<BookingNotification> pending = notificationRepository.findPendingByBookingId(bookingId);
        for (BookingNotification notification : pending) {
            notification.setStatus(NotificationStatus.RESOLVED);
            notification.setResolvedAt(TimeUtils.now());
            notification.setResolvedBy("system");
            notification.setResponse(NotificationResponse.PAID_OR_CANCELLED);
            notificationRepository.save(notification);
            log.info("Auto-resolved {} notification #{} for booking #{} (booking status changed)",
                notification.getNotificationType(), notification.getId(), bookingId);
        }
    }

    /* ===================================================================
     * helpers
     * =================================================================== */

    /** Ключ для группировки по клиенту */
    private String buildCustomerKey(Booking b) {
        String name = b.getCustomerName() != null ? b.getCustomerName().toLowerCase().trim() : "";
        String phone = b.getCustomerPhone() != null ? b.getCustomerPhone().toLowerCase().trim() : "";
        return name + "_" + phone;
    }

    /** Группировка бронирований по клиенту */
    private Map<String, List<Booking>> groupByCustomer(List<Booking> bookings) {
        Map<String, List<Booking>> map = new HashMap<>();
        for (Booking b : bookings) {
            String key = buildCustomerKey(b);
            if (key.equals("_")) continue; // нет имени и телефона
            map.computeIfAbsent(key, k -> new ArrayList<>()).add(b);
        }
        return map;
    }

    /** Проверка: является ли бронь последней (по endAt) среди активных броней клиента */
    private boolean isLastActiveBookingOfCustomer(Booking booking, List<Booking> customerBookings) {
        List<Booking.BookingStatus> activeStatuses = Arrays.asList(
            Booking.BookingStatus.CONFIRMED, Booking.BookingStatus.DRAFT
        );
        return customerBookings.stream()
            .filter(b -> activeStatuses.contains(b.getStatus()))
            .noneMatch(b -> !b.getId().equals(booking.getId()) && b.getEndAt().isAfter(booking.getEndAt()));
    }

    /** Загружаем LAZY-связи для JSON-сериализации */
    private void initLazy(BookingNotification n) {
        Booking b = n.getBooking();
        if (b != null) {
            if (b.getActivity() != null) b.getActivity().getName();
            if (b.getBranch() != null) b.getBranch().getName();
        }
    }
}
