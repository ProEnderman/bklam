package com.restaurant.service;

import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.*;
import com.restaurant.repository.*;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.io.ByteArrayOutputStream;
import java.io.OutputStreamWriter;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class BookingService {

    /** Статусы броней, которые занимают площадку для проверки полной брони. */
    private static final List<Booking.BookingStatus> FULL_VENUE_BLOCKING_STATUSES =
        List.of(Booking.BookingStatus.DRAFT, Booking.BookingStatus.CONFIRMED, Booking.BookingStatus.PAID, Booking.BookingStatus.COMPLETED);
    
    private final BookingRepository bookingRepository;
    private final BookingOrderRepository bookingOrderRepository;
    private final ActivityRepository activityRepository;
    private final ResourceRepository resourceRepository;
    private final PricingService pricingService;
    private final PricingRunRepository pricingRunRepository;
    private final RestaurantRepository restaurantRepository;
    private final ActivityLogService activityLogService;
    private final BookingNotificationService bookingNotificationService;
    private final TariffSpecialDateModifierRepository tariffSpecialDateModifierRepository;
    
    /**
     * Получить все бронирования
     */
    @Transactional(readOnly = true)
    public List<Booking> getBookings(Long branchId, Long activityId, LocalDateTime from, LocalDateTime to, Booking.BookingStatus status) {
        // REGULAR_WORKER должен иметь право VIEW_BOOKINGS
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(UserPermission.VIEW_BOOKINGS)) {
            throw new BusinessException("You don't have permission to view bookings");
        }
        
        LocalDateTime fromDate = from != null ? from : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDate = to != null ? to : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        List<Booking> bookings = bookingRepository.findBookings(branchId, activityId, status, fromDate, toDate);
        // Инициализируем lazy-loaded связи для корректной сериализации JSON
        for (Booking booking : bookings) {
            if (booking.getBranch() != null) {
                booking.getBranch().getName(); // Инициализируем branch
            }
            if (booking.getActivity() != null) {
                booking.getActivity().getName(); // Инициализируем activity
                // Инициализируем tariffPlan внутри activity
                if (booking.getActivity().getTariffPlan() != null) {
                    booking.getActivity().getTariffPlan().getName(); // Инициализируем tariffPlan
                    // Инициализируем calendar внутри tariffPlan
                    if (booking.getActivity().getTariffPlan().getCalendar() != null) {
                        booking.getActivity().getTariffPlan().getCalendar().getName(); // Инициализируем calendar
                        booking.getActivity().getTariffPlan().getCalendar().getSpecialDates().size(); // Инициализируем specialDates
                    }
                }
            }
            // Инициализируем pricingRun, но не order внутри него (order не нужен в JSON)
            if (booking.getPricingRun() != null) {
                booking.getPricingRun().getTotalAmount(); // Инициализируем pricingRun
            }
        }
        return bookings;
    }

    /**
     * Получить бронирования с пагинацией (страница по 100).
     */
    @Transactional(readOnly = true)
    public Page<Booking> getBookingsPage(Long branchId, Long activityId, LocalDateTime from, LocalDateTime to,
                                          Booking.BookingStatus status, Pageable pageable) {
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(UserPermission.VIEW_BOOKINGS)) {
            throw new BusinessException("You don't have permission to view bookings");
        }
        LocalDateTime fromDate = from != null ? from : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDate = to != null ? to : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        Page<Booking> page = bookingRepository.findBookingsPage(branchId, activityId, status, fromDate, toDate, pageable);
        touchBookingsLazyFields(page.getContent());
        return page;
    }

    @Transactional(readOnly = true)
    public Page<Booking> getBookingsPageByStatusIn(Long branchId, Long activityId, LocalDateTime from, LocalDateTime to,
                                                   List<Booking.BookingStatus> statuses, Pageable pageable) {
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(UserPermission.VIEW_BOOKINGS)) {
            throw new BusinessException("You don't have permission to view bookings");
        }
        if (statuses == null || statuses.isEmpty()) {
            return getBookingsPage(branchId, activityId, from, to, null, pageable);
        }
        LocalDateTime fromDate = from != null ? from : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDate = to != null ? to : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        Page<Booking> page = bookingRepository.findBookingsPageByStatusIn(branchId, activityId, statuses, fromDate, toDate, pageable);
        touchBookingsLazyFields(page.getContent());
        return page;
    }

    @Transactional(readOnly = true)
    public Page<Booking> getBookingsPageByStatusInWithCustomerSearch(Long branchId, Long activityId, LocalDateTime from, LocalDateTime to,
                                                                     List<Booking.BookingStatus> statuses, String customerSearch, Pageable pageable) {
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(UserPermission.VIEW_BOOKINGS)) {
            throw new BusinessException("You don't have permission to view bookings");
        }
        if (statuses == null || statuses.isEmpty()) {
            return getBookingsPage(branchId, activityId, from, to, null, pageable);
        }
        if (customerSearch == null || customerSearch.isBlank()) {
            return getBookingsPageByStatusIn(branchId, activityId, from, to, statuses, pageable);
        }
        LocalDateTime fromDate = from != null ? from : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDate = to != null ? to : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        Page<Booking> page = bookingRepository.findBookingsPageByStatusInAndCustomerSearch(
            branchId, activityId, statuses, fromDate, toDate, customerSearch.trim(), pageable);
        touchBookingsLazyFields(page.getContent());
        return page;
    }

    private void touchBookingsLazyFields(List<Booking> content) {
        for (Booking booking : content) {
            if (booking.getBranch() != null) booking.getBranch().getName();
            if (booking.getActivity() != null) {
                booking.getActivity().getName();
                if (booking.getActivity().getTariffPlan() != null) {
                    booking.getActivity().getTariffPlan().getName();
                    if (booking.getActivity().getTariffPlan().getCalendar() != null) {
                        booking.getActivity().getTariffPlan().getCalendar().getName();
                        booking.getActivity().getTariffPlan().getCalendar().getSpecialDates().size();
                    }
                }
            }
            if (booking.getPricingRun() != null) booking.getPricingRun().getTotalAmount();
            if (booking.getBookingOrder() != null) {
                booking.getBookingOrder().getId();
                if (booking.getBookingOrder().getBranch() != null) booking.getBookingOrder().getBranch().getId();
            }
        }
    }
    
    /**
     * Получить бронирование по ID
     */
    @Transactional(readOnly = true)
    public Booking getBookingById(Long id) {
        Booking booking = bookingRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Booking not found"));
        // Инициализируем lazy-loaded связи для корректной сериализации JSON
        if (booking.getBranch() != null) {
            booking.getBranch().getName();
        }
        if (booking.getActivity() != null) {
            booking.getActivity().getName();
            if (booking.getActivity().getTariffPlan() != null) {
                booking.getActivity().getTariffPlan().getName();
                if (booking.getActivity().getTariffPlan().getCalendar() != null) {
                    booking.getActivity().getTariffPlan().getCalendar().getName();
                    booking.getActivity().getTariffPlan().getCalendar().getSpecialDates().size();
                }
            }
        }
        return booking;
    }
    
    /**
     * Проверка вместимости для бронирования
     */
    @Transactional(readOnly = true)
    public void checkCapacity(Booking booking) {
        Activity activity = booking.getActivity();
        if (activity == null) {
            throw new BusinessException("Activity is required");
        }
        
        Long branchId = booking.getBranch().getId();
        Long activityId = activity.getId();
        Long resourceId = booking.getResource() != null ? booking.getResource().getId() : null;
        LocalDateTime startAt = booking.getStartAt();
        LocalDateTime endAt = booking.getEndAt();
        
        // Исключаем текущее бронирование из проверки (при обновлении)
        List<Booking> overlappingBookings = bookingRepository.findOverlappingBookings(
            branchId,
            activityId,
            resourceId,
            startAt,
            endAt,
            List.of(Booking.BookingStatus.DRAFT, Booking.BookingStatus.CONFIRMED)
        );
        
        // Если это обновление, исключаем само бронирование
        if (booking.getId() != null) {
            overlappingBookings.removeIf(b -> b.getId().equals(booking.getId()));
        }
        
        // Проверка для EXCLUSIVE режима
        if (activity.getBookingMode() == Activity.BookingMode.EXCLUSIVE || 
            activity.getConcurrentLimit() == 1) {
            if (!overlappingBookings.isEmpty()) {
                String activityName = activity.getName();
                throw new BusinessException(
                    String.format("%s уже занят(а) на выбранное время", activityName)
                );
            }
        }
        
        // Проверка для CAPACITY режима
        if (activity.getBookingMode() == Activity.BookingMode.CAPACITY) {
            int currentBookings = overlappingBookings.size();
            int limit = activity.getConcurrentLimit();
            
            if (currentBookings >= limit) {
                String activityName = activity.getName();
                throw new BusinessException(
                    String.format(
                        "Для %s доступно %d параллельных записей, сейчас занято %d",
                        activityName, limit, currentBookings
                    )
                );
            }
        }
    }
    
    /**
     * Проверка: gap-filler активность (поминутная оплата) не может пересекаться
     * с другими бронированиями того же клиента.
     * Обычные активности (бильярд, караоке и т.д.) МОГУТ пересекаться друг с другом —
     * компания может одновременно играть в бильярд и боулинг.
     */
    private void checkGapFillerOverlap(Booking booking, Activity activity) {
        if (activity == null || !Boolean.TRUE.equals(activity.getGapFiller())) {
            return;
        }
        
        String customerName = booking.getCustomerName();
        String customerPhone = booking.getCustomerPhone();
        if (customerName == null || customerName.isBlank() || customerPhone == null || customerPhone.isBlank()) {
            return;
        }
        
        Long branchId = booking.getBranch() != null ? booking.getBranch().getId() : null;
        if (branchId == null) return;
        
        List<Booking> customerOverlaps = bookingRepository.findOverlappingByCustomer(
            branchId, customerName, customerPhone,
            booking.getStartAt(), booking.getEndAt(),
            List.of(Booking.BookingStatus.DRAFT, Booking.BookingStatus.CONFIRMED, Booking.BookingStatus.PAID)
        );
        
        // Исключаем само бронирование (при обновлении)
        if (booking.getId() != null) {
            customerOverlaps.removeIf(b -> b.getId().equals(booking.getId()));
        }
        
        if (!customerOverlaps.isEmpty()) {
            Booking conflict = customerOverlaps.get(0);
            String conflictActivity = conflict.getActivity() != null ? conflict.getActivity().getName() : "другая услуга";
            throw new BusinessException(
                String.format("Посещение (поминутная оплата) не может пересекаться с другими бронированиями. " +
                    "У клиента %s уже есть бронь «%s» на %s – %s",
                    customerName, conflictActivity,
                    conflict.getStartAt().toLocalTime().toString(),
                    conflict.getEndAt().toLocalTime().toString())
            );
        }
    }

    /**
     * Полная бронь (fullVenueLock): блокирует все остальные мероприятия филиала на пересекающееся время;
     * обычная бронь не может пересечься с интервалом полной брони.
     */
    private void checkFullVenueLock(Booking booking) {
        Activity a = booking.getActivity();
        if (a == null || booking.getBranch() == null) {
            return;
        }
        boolean thisFv = Boolean.TRUE.equals(a.getFullVenueLock());
        List<Booking> overlaps = bookingRepository.findOverlappingBookingsBranchWide(
            booking.getBranch().getId(),
            booking.getStartAt(),
            booking.getEndAt(),
            FULL_VENUE_BLOCKING_STATUSES
        );
        if (booking.getId() != null) {
            overlaps.removeIf(o -> o.getId().equals(booking.getId()));
        }
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
        for (Booking o : overlaps) {
            Activity oa = o.getActivity();
            if (oa == null) {
                continue;
            }
            boolean otherFv = Boolean.TRUE.equals(oa.getFullVenueLock());
            if (!thisFv && !otherFv) {
                continue;
            }
            if (thisFv && !otherFv) {
                throw new BusinessException(String.format(
                    "Режим «Полная бронь» («%s»): на это время уже есть бронь другого мероприятия («%s», %s — %s).",
                    a.getName(), oa.getName(), fmt.format(o.getStartAt()), fmt.format(o.getEndAt())));
            }
            if (!thisFv) {
                throw new BusinessException(String.format(
                    "С %s по %s на площадке действует полная бронь «%s» — бронирование «%s» в этот период невозможно.",
                    fmt.format(o.getStartAt()), fmt.format(o.getEndAt()), oa.getName(), a.getName()));
            }
            throw new BusinessException(String.format(
                "Пересечение с полной бронью «%s» (%s — %s). В один интервал допускается только одна полная бронь.",
                oa.getName(), fmt.format(o.getStartAt()), fmt.format(o.getEndAt())));
        }
    }

    /**
     * Интервалы полных броней филиала (для календаря занятости и подсказок).
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getFullVenueBlocks(Long branchId, LocalDateTime from, LocalDateTime to) {
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(UserPermission.VIEW_BOOKINGS)) {
            throw new BusinessException("You don't have permission to view bookings");
        }
        Long bid = branchId != null ? branchId : SecurityUtils.getCurrentRestaurantId();
        if (bid == null) {
            throw new BusinessException("Branch ID is required");
        }
        List<Booking> list = bookingRepository.findFullVenueBookingsOverlapping(bid, from, to, FULL_VENUE_BLOCKING_STATUSES);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
        List<Map<String, Object>> out = new ArrayList<>();
        for (Booking b : list) {
            Activity act = b.getActivity();
            String name = act != null ? act.getName() : "—";
            Map<String, Object> row = new HashMap<>();
            row.put("bookingId", b.getId());
            row.put("activityId", act != null ? act.getId() : null);
            row.put("activityName", name);
            row.put("startAt", b.getStartAt());
            row.put("endAt", b.getEndAt());
            row.put("message", String.format(
                "С %s по %s на площадке действует полная бронь «%s» — другие мероприятия в этот период недоступны.",
                fmt.format(b.getStartAt()), fmt.format(b.getEndAt()), name));
            out.add(row);
        }
        return out;
    }
    
    /**
     * Проверка допустимого времени бронирования из тарифного плана.
     * Например, бильярд 24/7 (00:00-23:59), а караоке только 18:00-02:00.
     */
    private void checkBookingAllowedHours(Activity activity, LocalDateTime startAt, LocalDateTime endAt) {
        TariffPlan tariffPlan = activity.getTariffPlan();
        if (tariffPlan == null) return;
        
        LocalTime allowedFrom = tariffPlan.getBookingTimeFrom();
        LocalTime allowedTo = tariffPlan.getBookingTimeTo();
        if (allowedFrom == null || allowedTo == null) return;
        
        // Проверяем, есть ли переопределение времени для конкретной даты бронирования
        LocalDate bookingDate = startAt.toLocalDate();
        try {
            TariffSpecialDateModifier dateModifier = tariffSpecialDateModifierRepository
                .findByTariffPlanIdAndDate(tariffPlan.getId(), bookingDate)
                .orElse(null);
            if (dateModifier != null && dateModifier.getBookingTimeFrom() != null && dateModifier.getBookingTimeTo() != null) {
                allowedFrom = dateModifier.getBookingTimeFrom();
                allowedTo = dateModifier.getBookingTimeTo();
            }
        } catch (Exception e) {
            log.warn("Could not check date-specific booking hours override for date {}: {}", bookingDate, e.getMessage());
        }
        
        // 00:00-23:59 = круглосуточно, не проверяем
        if (allowedFrom.equals(LocalTime.MIDNIGHT) && 
            (allowedTo.equals(LocalTime.of(23, 59)) || allowedTo.equals(LocalTime.of(23, 59, 59)))) {
            return;
        }
        
        LocalTime bookingStart = startAt.toLocalTime();
        LocalTime bookingEnd = endAt.toLocalTime();
        // Если endAt ровно 00:00 (полночь), трактуем как конец дня
        if (bookingEnd.equals(LocalTime.MIDNIGHT)) {
            bookingEnd = LocalTime.of(23, 59, 59);
        }
        
        boolean crossesMidnight = allowedTo.isBefore(allowedFrom); // Например 18:00 - 02:00
        
        boolean startAllowed;
        boolean endAllowed;
        
        if (crossesMidnight) {
            // Допустимое время пересекает полночь (напр. 18:00-02:00)
            startAllowed = !bookingStart.isBefore(allowedFrom) || !bookingStart.isAfter(allowedTo);
            endAllowed = !bookingEnd.isBefore(allowedFrom) || !bookingEnd.isAfter(allowedTo);
        } else {
            // Обычный диапазон (напр. 10:00-22:00)
            startAllowed = !bookingStart.isBefore(allowedFrom) && !bookingStart.isAfter(allowedTo);
            endAllowed = !bookingEnd.isBefore(allowedFrom) && !bookingEnd.isAfter(allowedTo);
        }
        
        if (!startAllowed || !endAllowed) {
            throw new BusinessException(
                String.format("Бронирование %s доступно только с %s до %s",
                    activity.getName(),
                    allowedFrom.toString().substring(0, 5),
                    allowedTo.toString().substring(0, 5))
            );
        }
    }
    
    /**
     * Создание бронирования с проверкой вместимости и расчётом стоимости
     */
    @Transactional
    public Booking createBooking(Booking booking) {
        // REGULAR_WORKER должен иметь право CREATE_BOOKINGS
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(UserPermission.CREATE_BOOKINGS)) {
            throw new BusinessException("You don't have permission to create bookings");
        }
        
        // Загружаем активность
        Long activityId = booking.getActivity() != null ? booking.getActivity().getId() : null;
        if (activityId == null) {
            throw new BusinessException("Activity ID is required");
        }
        Activity activity = activityRepository.findById(activityId)
            .orElseThrow(() -> new ResourceNotFoundException("Activity not found"));
        booking.setActivity(activity);
        
        // Загружаем филиал (используем текущий ресторан пользователя, если не указан)
        Long branchId = booking.getBranch() != null ? booking.getBranch().getId() : null;
        if (branchId == null) {
            branchId = SecurityUtils.getCurrentRestaurantId();
        }
        if (branchId == null) {
            throw new BusinessException("Branch ID is required");
        }
        Restaurant branch = restaurantRepository.findById(branchId)
            .orElseThrow(() -> new ResourceNotFoundException("Branch not found"));
        booking.setBranch(branch);
        
        // Привязка к заказу бронирований (если передан bookingOrderId)
        if (booking.getBookingOrderId() != null) {
            BookingOrder order = bookingOrderRepository.findById(booking.getBookingOrderId())
                .orElseThrow(() -> new ResourceNotFoundException("Booking order not found"));
            if (!order.getBranchId().equals(branchId)) {
                throw new BusinessException("Booking order belongs to another branch");
            }
            booking.setBookingOrder(order);
        }
        
        // Загружаем ресурс, если указан
        if (booking.getResource() != null && booking.getResource().getId() != null) {
            Resource resource = resourceRepository.findById(booking.getResource().getId())
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
            booking.setResource(resource);
        }
        
        // Валидация времени
        if (booking.getStartAt() == null || booking.getEndAt() == null) {
            throw new BusinessException("Время начала и окончания обязательны");
        }
        // Обнуляем секунды и наносекунды для точного расчёта цены
        booking.setStartAt(booking.getStartAt().withSecond(0).withNano(0));
        booking.setEndAt(booking.getEndAt().withSecond(0).withNano(0));
        
        if (!booking.getEndAt().isAfter(booking.getStartAt())) {
            throw new BusinessException("Время окончания должно быть позже времени начала");
        }
        
        // Проверка допустимого времени бронирования (из тарифного плана)
        checkBookingAllowedHours(activity, booking.getStartAt(), booking.getEndAt());
        
        // Проверка: gap-filler не может пересекаться с другими бронями того же клиента
        checkGapFillerOverlap(booking, activity);

        // Полная бронь площадки / пересечение с ней
        checkFullVenueLock(booking);
        
        // Проверка вместимости
        checkCapacity(booking);
        
        // Расчёт стоимости через Pricing Engine
        // Если вызывающий код уже задал totalAmount (напр. с учётом стоп-чека), НЕ перезаписываем
        if (booking.getTotalAmount() == null) {
            PricingRun pricingRun = calculatePricing(booking);
            booking.setPricingRun(pricingRun);
            booking.setTotalAmount(pricingRun.getTotalAmount());
        } else {
            // Всё равно рассчитываем PricingRun для аналитики, но не перезаписываем totalAmount
            try {
                PricingRun pricingRun = calculatePricing(booking);
                booking.setPricingRun(pricingRun);
                // totalAmount оставляем как есть (уже задан вызывающим кодом)
            } catch (Exception e) {
                log.warn("Pricing calculation failed for booking with pre-set totalAmount: {}", e.getMessage());
                // Не критично — totalAmount уже задан
            }
        }
        
        // Устанавливаем создателя
        com.restaurant.security.UserPrincipal user = SecurityUtils.getCurrentUser();
        booking.setCreatedBy(user != null ? user.getUsername() : "system");
        
        Booking saved = bookingRepository.save(booking);
        log.info("Booking created: id={}, activity={}, start={}, end={}", 
            saved.getId(), activity.getName(), saved.getStartAt(), saved.getEndAt());
        
        try {
            activityLogService.logActivity(
                "CREATE", "BOOKING", saved.getId(), null,
                String.format("Создано бронирование: активность=%s, %s — %s, клиент=%s",
                    activity.getName(), saved.getStartAt(), saved.getEndAt(),
                    saved.getCustomerName() != null ? saved.getCustomerName() : "—"),
                null,
                Map.of("activityName", activity.getName(),
                       "startAt", saved.getStartAt().toString(),
                       "endAt", saved.getEndAt().toString(),
                       "customerName", saved.getCustomerName() != null ? saved.getCustomerName() : "",
                       "status", saved.getStatus().toString(),
                       "totalAmount", saved.getTotalAmount() != null ? saved.getTotalAmount().toString() : "0")
            );
        } catch (Exception e) {
            log.error("Failed to log booking create activity: {}", e.getMessage());
        }
        
        return saved;
    }
    
    /**
     * Обновление бронирования с повторной проверкой вместимости
     */
    @Transactional
    public Booking updateBooking(Long id, Booking bookingUpdate) {
        // REGULAR_WORKER должен иметь право EDIT_BOOKINGS
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(UserPermission.EDIT_BOOKINGS)) {
            throw new BusinessException("You don't have permission to edit bookings");
        }
        
        Booking existing = bookingRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Booking not found"));
        
        // Обновляем поля (обнуляем секунды/наносекунды для точного расчёта цены)
        if (bookingUpdate.getStartAt() != null) existing.setStartAt(bookingUpdate.getStartAt().withSecond(0).withNano(0));
        if (bookingUpdate.getEndAt() != null) existing.setEndAt(bookingUpdate.getEndAt().withSecond(0).withNano(0));
        if (bookingUpdate.getActivity() != null) {
            Activity activity = activityRepository.findById(bookingUpdate.getActivity().getId())
                .orElseThrow(() -> new ResourceNotFoundException("Activity not found"));
            existing.setActivity(activity);
        }
        if (bookingUpdate.getResource() != null) {
            if (bookingUpdate.getResource().getId() != null) {
                Resource resource = resourceRepository.findById(bookingUpdate.getResource().getId())
                    .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
                existing.setResource(resource);
            } else {
                existing.setResource(null);
            }
        }
        if (bookingUpdate.getCustomerName() != null) existing.setCustomerName(bookingUpdate.getCustomerName());
        if (bookingUpdate.getCustomerPhone() != null) existing.setCustomerPhone(bookingUpdate.getCustomerPhone());
        if (bookingUpdate.getNotes() != null) existing.setNotes(bookingUpdate.getNotes());
        if (bookingUpdate.getStatus() != null) existing.setStatus(bookingUpdate.getStatus());
        if (bookingUpdate.getBookingOrderId() != null) {
            BookingOrder order = bookingOrderRepository.findById(bookingUpdate.getBookingOrderId())
                .orElseThrow(() -> new ResourceNotFoundException("Booking order not found"));
            if (!order.getBranchId().equals(existing.getBranchId())) {
                throw new BusinessException("Booking order belongs to another branch");
            }
            existing.setBookingOrder(order);
        }
        
        // Валидация времени
        if (!existing.getEndAt().isAfter(existing.getStartAt())) {
            throw new BusinessException("Время окончания должно быть позже времени начала");
        }
        
        // Проверка: gap-filler не может пересекаться с другими бронями того же клиента
        checkGapFillerOverlap(existing, existing.getActivity());

        checkFullVenueLock(existing);
        
        // Повторная проверка вместимости
        checkCapacity(existing);
        
        // Пересчёт стоимости, если изменилось время или активность
        if (bookingUpdate.getStartAt() != null || bookingUpdate.getEndAt() != null || 
            bookingUpdate.getActivity() != null) {
            PricingRun pricingRun = calculatePricing(existing);
            existing.setPricingRun(pricingRun);
            existing.setTotalAmount(pricingRun.getTotalAmount());
        }
        
        Booking saved = bookingRepository.save(existing);
        
        try {
            activityLogService.logActivity(
                "UPDATE", "BOOKING", saved.getId(), null,
                String.format("Обновлено бронирование #%d", saved.getId()),
                null,
                Map.of("startAt", saved.getStartAt().toString(),
                       "endAt", saved.getEndAt().toString(),
                       "customerName", saved.getCustomerName() != null ? saved.getCustomerName() : "",
                       "status", saved.getStatus().toString())
            );
        } catch (Exception e) {
            log.error("Failed to log booking update activity: {}", e.getMessage());
        }
        
        return saved;
    }
    
    /**
     * Отмена бронирования
     */
    @Transactional
    public Booking cancelBooking(Long id) {
        // REGULAR_WORKER должен иметь право CANCEL_BOOKINGS
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(UserPermission.CANCEL_BOOKINGS)) {
            throw new BusinessException("You don't have permission to cancel bookings");
        }
        
        Booking booking = bookingRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Booking not found"));
        
        booking.setStatus(Booking.BookingStatus.CANCELLED);
        booking.setCancelledAt(com.restaurant.util.TimeUtils.now());
        
        Booking saved = bookingRepository.save(booking);
        
        // Автоматически закрываем все PENDING уведомления для этого бронирования
        bookingNotificationService.autoResolveForBooking(saved.getId());
        
        // Отменяем «сиротские» филлеры: посещения без соседней основной брони (в том числе после удаления заказа без отмены)
        if (saved.getActivity() != null && !Boolean.TRUE.equals(saved.getActivity().getGapFiller())) {
            if (saved.getBookingOrderId() != null) {
                cancelOrphanedFillersInGroup(bookingRepository.findByBookingOrder_Id(saved.getBookingOrderId()));
            } else if (saved.getBranchId() != null && (saved.getCustomerName() != null || saved.getCustomerPhone() != null)) {
                String name = saved.getCustomerName() != null ? saved.getCustomerName().trim() : "";
                String phone = saved.getCustomerPhone() != null ? saved.getCustomerPhone().trim() : "";
                List<Booking> clientBookings = bookingRepository.findByBranchAndCustomer(
                    saved.getBranchId(), name, phone, Booking.BookingStatus.CANCELLED);
                cancelOrphanedFillersInGroup(clientBookings);
            }
        }
        
        // Инициализируем lazy-loaded связи для корректной сериализации JSON
        if (saved.getBranch() != null) {
            saved.getBranch().getName();
        }
        if (saved.getActivity() != null) {
            saved.getActivity().getName();
            if (saved.getActivity().getTariffPlan() != null) {
                saved.getActivity().getTariffPlan().getName();
                if (saved.getActivity().getTariffPlan().getCalendar() != null) {
                    saved.getActivity().getTariffPlan().getCalendar().getName();
                    saved.getActivity().getTariffPlan().getCalendar().getSpecialDates().size();
                }
            }
        }
        if (saved.getPricingRun() != null) {
            saved.getPricingRun().getTotalAmount();
        }
        
        try {
            activityLogService.logActivity(
                "CANCEL", "BOOKING", saved.getId(), null,
                String.format("Отменено бронирование #%d, клиент=%s",
                    saved.getId(), saved.getCustomerName() != null ? saved.getCustomerName() : "—"),
                Map.of("status", "CONFIRMED"),
                Map.of("status", "CANCELLED")
            );
        } catch (Exception e) {
            log.error("Failed to log booking cancel activity: {}", e.getMessage());
        }
        
        return saved;
    }
    
    /**
     * Массовая отмена бронирований по списку id (в одной транзакции).
     * Уже отменённые пропускаются. Используется для «удаления заказа» — один запрос вместо N.
     */
    @Transactional
    public List<Booking> cancelBookings(List<Long> bookingIds) {
        if (bookingIds == null || bookingIds.isEmpty()) {
            return List.of();
        }
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(UserPermission.CANCEL_BOOKINGS)) {
            throw new BusinessException("You don't have permission to cancel bookings");
        }
        List<Booking> cancelled = new ArrayList<>();
        for (Long id : bookingIds) {
            Booking booking = bookingRepository.findById(id).orElse(null);
            if (booking == null) continue;
            if (booking.getStatus() == Booking.BookingStatus.CANCELLED) continue;
            booking.setStatus(Booking.BookingStatus.CANCELLED);
            booking.setCancelledAt(com.restaurant.util.TimeUtils.now());
            cancelled.add(bookingRepository.save(booking));
            bookingNotificationService.autoResolveForBooking(booking.getId());
        }
        for (Booking saved : cancelled) {
            try {
                activityLogService.logActivity(
                    "CANCEL", "BOOKING", saved.getId(), null,
                    String.format("Отменено бронирование #%d (массовая отмена заказа)",
                        saved.getId()),
                    Map.of("status", "CONFIRMED"),
                    Map.of("status", "CANCELLED")
                );
            } catch (Exception e) {
                log.error("Failed to log booking cancel activity: {}", e.getMessage());
            }
        }
        // Для каждого заказа: отменяем сиротские филлеры
        for (Long orderId : cancelled.stream().map(Booking::getBookingOrderId).filter(id -> id != null).distinct().toList()) {
            cancelOrphanedFillersInGroup(bookingRepository.findByBookingOrder_Id(orderId));
        }
        // Для отменённых без заказа — по клиенту
        for (Booking b : cancelled) {
            if (b.getBookingOrderId() != null) continue;
            if (b.getBranchId() == null) continue;
            String name = b.getCustomerName() != null ? b.getCustomerName().trim() : "";
            String phone = b.getCustomerPhone() != null ? b.getCustomerPhone().trim() : "";
            cancelOrphanedFillersInGroup(bookingRepository.findByBranchAndCustomer(
                b.getBranchId(), name, phone, Booking.BookingStatus.CANCELLED));
        }
        return cancelled;
    }
    
    private static boolean isFiller(Booking b) {
        return b.getActivity() != null && Boolean.TRUE.equals(b.getActivity().getGapFiller());
    }
    
    /**
     * Отменяет филлеры (Посещение), у которых нет активной основной брони до или после по времени.
     * Группа — либо все брони заказа, либо активные брони клиента (без заказа).
     */
    private void cancelOrphanedFillersInGroup(List<Booking> group) {
        if (group == null || group.isEmpty()) return;
        List<Booking> sorted = new ArrayList<>(group);
        sorted.sort(Comparator.comparing(Booking::getStartAt));
        for (Booking filler : sorted) {
            if (filler.getStatus() == Booking.BookingStatus.CANCELLED) continue;
            if (!isFiller(filler)) continue;
            Booking prev = sorted.stream()
                .filter(x -> x.getStatus() != Booking.BookingStatus.CANCELLED && !isFiller(x)
                    && x.getEndAt() != null && filler.getStartAt() != null
                    && !x.getEndAt().isAfter(filler.getStartAt()))
                .max(Comparator.comparing(Booking::getEndAt))
                .orElse(null);
            Booking next = sorted.stream()
                .filter(x -> x.getStatus() != Booking.BookingStatus.CANCELLED && !isFiller(x)
                    && x.getStartAt() != null && filler.getEndAt() != null
                    && !x.getStartAt().isBefore(filler.getEndAt()))
                .min(Comparator.comparing(Booking::getStartAt))
                .orElse(null);
            if (prev != null && next != null) continue;
            filler.setStatus(Booking.BookingStatus.CANCELLED);
            filler.setCancelledAt(com.restaurant.util.TimeUtils.now());
            bookingRepository.save(filler);
            bookingNotificationService.autoResolveForBooking(filler.getId());
            log.info("Auto-cancelled orphaned filler booking {}", filler.getId());
            try {
                activityLogService.logActivity(
                    "CANCEL", "BOOKING", filler.getId(), null,
                    "Отменено бронирование-филлер (посещение) — нет соседней основной брони",
                    Map.of("status", "CONFIRMED"),
                    Map.of("status", "CANCELLED")
                );
            } catch (Exception e) {
                log.error("Failed to log filler cancel activity: {}", e.getMessage());
            }
        }
    }
    
    /**
     * Отметить бронирование как оплаченное
     */
    @Transactional
    public Booking markAsPaid(Long id) {
        Booking booking = bookingRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Booking not found"));
        
        if (booking.getStatus() == Booking.BookingStatus.CANCELLED) {
            throw new BusinessException("Cannot mark cancelled booking as paid");
        }
        
        booking.setStatus(Booking.BookingStatus.PAID);
        booking.setPaidAt(com.restaurant.util.TimeUtils.now());
        
        Booking saved = bookingRepository.save(booking);
        
        // Автоматически закрываем все PENDING уведомления для этого бронирования
        bookingNotificationService.autoResolveForBooking(saved.getId());
        
        // Инициализируем lazy-loaded связи для корректной сериализации JSON
        if (saved.getBranch() != null) {
            saved.getBranch().getName();
        }
        if (saved.getActivity() != null) {
            saved.getActivity().getName();
            if (saved.getActivity().getTariffPlan() != null) {
                saved.getActivity().getTariffPlan().getName();
                if (saved.getActivity().getTariffPlan().getCalendar() != null) {
                    saved.getActivity().getTariffPlan().getCalendar().getName();
                    saved.getActivity().getTariffPlan().getCalendar().getSpecialDates().size();
                }
            }
        }
        if (saved.getPricingRun() != null) {
            saved.getPricingRun().getTotalAmount();
        }
        if (saved.getBookingOrder() != null) {
            saved.getBookingOrder().getId();
            if (saved.getBookingOrder().getBranch() != null) {
                saved.getBookingOrder().getBranch().getId();
            }
        }
        
        try {
            activityLogService.logActivity(
                "MARK_PAID", "BOOKING", saved.getId(), null,
                String.format("Оплачено бронирование #%d, клиент=%s, сумма=%s",
                    saved.getId(),
                    saved.getCustomerName() != null ? saved.getCustomerName() : "—",
                    saved.getTotalAmount() != null ? saved.getTotalAmount().toString() : "0"),
                Map.of("status", "CONFIRMED"),
                Map.of("status", "PAID")
            );
        } catch (Exception e) {
            log.error("Failed to log booking mark-paid activity: {}", e.getMessage());
        }
        
        return saved;
    }
    
    /**
     * Расчёт стоимости через Pricing Engine
     */
    private PricingRun calculatePricing(Booking booking) {
        Activity activity = booking.getActivity();
        // Создаём запрос для Pricing Engine
        PricingService.PricingRequest request = new PricingService.PricingRequest();
        request.setRestaurantId(booking.getBranch().getId());
        request.setServiceId(activity.getId());
        request.setClientId(booking.getCustomer() != null ? booking.getCustomer().getId() : null);
        request.setServiceStart(booking.getStartAt());
        request.setServiceEnd(booking.getEndAt());
        
        // Вызываем Pricing Engine
        PricingService.PricingResult result = pricingService.run(request);
        
        // Если расчёт остановлен (например, нет тарифного плана)
        if (result.getStatus() == PricingRun.PricingStatus.STOP) {
            throw new BusinessException(result.getStopReason() != null 
                ? result.getStopReason() 
                : "Расчёт цены невозможен");
        }
        
        // PricingRun уже сохранён в pricingService.run
        if (result.getPricingRunId() != null) {
            return pricingRunRepository.findById(result.getPricingRunId())
                .orElseThrow(() -> new BusinessException("Pricing run not found"));
        }
        
        throw new BusinessException("Pricing run ID not set in result");
    }

    private static final DateTimeFormatter CSV_DATETIME = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    @Transactional(readOnly = true)
    public byte[] exportBookingsToCsv(Long branchId, LocalDateTime from, LocalDateTime to) {
        if (branchId == null) {
            branchId = SecurityUtils.getCurrentRestaurantId();
        }
        if (branchId == null) {
            throw new BusinessException("Branch/restaurant ID is required for export");
        }
        LocalDateTime fromDate = from != null ? from : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime toDate = to != null ? to : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        List<Booking> bookings = bookingRepository.findBookings(branchId, null, null, fromDate, toDate);
        touchBookingsLazyFields(bookings);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        OutputStreamWriter w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        try {
            w.write("\uFEFF");
            w.write("id,branch_id,activity_id,start_at,end_at,status,customer_name,customer_phone,total_amount,notes,created_at\n");
            for (Booking b : bookings) {
                w.write((b.getId() != null ? b.getId() : "") + ","
                    + (b.getBranchId() != null ? b.getBranchId() : "") + ","
                    + (b.getActivityId() != null ? b.getActivityId() : "") + ","
                    + escapeCsv(b.getStartAt() != null ? b.getStartAt().format(CSV_DATETIME) : "") + ","
                    + escapeCsv(b.getEndAt() != null ? b.getEndAt().format(CSV_DATETIME) : "") + ","
                    + (b.getStatus() != null ? b.getStatus().name() : "") + ","
                    + escapeCsv(b.getCustomerName()) + "," + escapeCsv(b.getCustomerPhone()) + ","
                    + (b.getTotalAmount() != null ? b.getTotalAmount().toPlainString() : "") + ","
                    + escapeCsv(b.getNotes()) + ","
                    + escapeCsv(b.getCreatedAt() != null ? b.getCreatedAt().format(CSV_DATETIME) : "") + "\n");
            }
            w.flush();
        } catch (java.io.IOException e) {
            throw new BusinessException("Export failed: " + e.getMessage());
        }
        return out.toByteArray();
    }

    private static String escapeCsv(String s) {
        if (s == null) return "";
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    @Transactional
    public Map<String, Object> importBookingsFromCsv(byte[] csvBytes, Long branchId) {
        if (branchId == null) {
            branchId = SecurityUtils.getCurrentRestaurantId();
        }
        if (branchId == null) {
            throw new BusinessException("Branch/restaurant ID is required for import");
        }
        String csv = new String(csvBytes, StandardCharsets.UTF_8).replace("\uFEFF", "");
        String[] lines = csv.split("\\r?\\n");
        if (lines.length < 2) {
            return Map.of("created", 0, "errors", List.of("CSV must have header and at least one row"));
        }
        List<String> errors = new ArrayList<>();
        int created = 0;
        Restaurant branch = restaurantRepository.findById(branchId)
            .orElseThrow(() -> new ResourceNotFoundException("Branch not found"));
        for (int i = 1; i < lines.length; i++) {
            String line = lines[i];
            if (line.isBlank()) continue;
            List<String> cells = parseCsvLine(line);
            if (cells.size() < 5) {
                errors.add("Line " + (i + 1) + ": need branch_id,activity_id,start_at,end_at,status");
                continue;
            }
            Long rowBranchId = parseLong(cells.get(0));
            Long activityId = parseLong(cells.get(1));
            LocalDateTime startAt = parseDateTime(cells.size() > 2 ? cells.get(2) : null);
            LocalDateTime endAt = parseDateTime(cells.size() > 3 ? cells.get(3) : null);
            Booking.BookingStatus status = parseBookingStatus(cells.size() > 4 ? cells.get(4) : null);
            if (rowBranchId != null && !rowBranchId.equals(branchId)) {
                errors.add("Line " + (i + 1) + ": branch_id must be " + branchId);
                continue;
            }
            if (activityId == null) {
                errors.add("Line " + (i + 1) + ": activity_id required");
                continue;
            }
            Activity activity = activityRepository.findById(activityId).orElse(null);
            if (activity == null || !branchId.equals(activity.getBranchId())) {
                errors.add("Line " + (i + 1) + ": activity not found or wrong branch");
                continue;
            }
            if (startAt == null || endAt == null) {
                errors.add("Line " + (i + 1) + ": start_at and end_at required");
                continue;
            }
            Booking booking = new Booking();
            booking.setBranch(branch);
            booking.setActivity(activity);
            booking.setStartAt(startAt);
            booking.setEndAt(endAt);
            booking.setStatus(status != null ? status : Booking.BookingStatus.DRAFT);
            booking.setCustomerName(cells.size() > 5 ? cells.get(5) : null);
            booking.setCustomerPhone(cells.size() > 6 ? cells.get(6) : null);
            booking.setTotalAmount(cells.size() > 7 && !cells.get(7).isBlank() ? new BigDecimal(cells.get(7).trim()) : null);
            booking.setNotes(cells.size() > 8 ? cells.get(8) : null);
            booking.setCreatedBy(cells.size() > 9 ? cells.get(9) : "import");
            try {
                checkGapFillerOverlap(booking, activity);
                checkFullVenueLock(booking);
                checkCapacity(booking);
                checkBookingAllowedHours(activity, startAt, endAt);
                Booking saved = bookingRepository.save(booking);
                if (saved.getTotalAmount() == null) {
                    try {
                        PricingRun pr = calculatePricing(saved);
                        saved.setPricingRun(pr);
                        saved.setTotalAmount(pr.getTotalAmount());
                        bookingRepository.save(saved);
                    } catch (Exception e) {
                        log.warn("Could not calculate pricing for imported booking: {}", e.getMessage());
                    }
                }
                created++;
            } catch (Exception e) {
                errors.add("Line " + (i + 1) + ": " + e.getMessage());
            }
        }
        return Map.of("created", created, "errors", errors);
    }

    private static List<String> parseCsvLine(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cur.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if ((c == ',' && !inQuotes) || c == '\n' || c == '\r') {
                out.add(cur.toString().trim());
                cur = new StringBuilder();
            } else {
                cur.append(c);
            }
        }
        out.add(cur.toString().trim());
        return out;
    }

    private static Long parseLong(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDateTime parseDateTime(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return LocalDateTime.parse(s.trim(), CSV_DATETIME);
        } catch (Exception e) {
            return null;
        }
    }

    private static Booking.BookingStatus parseBookingStatus(String s) {
        if (s == null || s.isBlank()) return Booking.BookingStatus.DRAFT;
        try {
            return Booking.BookingStatus.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return Booking.BookingStatus.DRAFT;
        }
    }
}

