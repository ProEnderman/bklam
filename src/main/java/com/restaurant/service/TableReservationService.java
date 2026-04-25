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

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TableReservationService {

    private final TableReservationRepository reservationRepository;
    private final HallTableRepository hallTableRepository;
    private final RestaurantRepository restaurantRepository;
    private final ActivityLogService activityLogService;

    /* =================== READ =================== */

    @Transactional(readOnly = true)
    public List<TableReservation> getReservations(Long restaurantId, Long tableId,
                                                   LocalDateTime from, LocalDateTime to,
                                                   TableReservation.ReservationStatus status) {
        Long restId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        if (restId == null) {
            throw new BusinessException("Restaurant ID is required");
        }

        List<TableReservation> reservations;
        if (from != null || to != null) {
            LocalDateTime fromDate = from != null ? from : LocalDateTime.of(1970, 1, 1, 0, 0);
            LocalDateTime toDate = to != null ? to : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
            reservations = reservationRepository.findReservations(restId, tableId, status, fromDate, toDate);
        } else {
            reservations = reservationRepository.findAllByRestaurant(restId, tableId, status);
        }

        initializeLazyFields(reservations);
        return reservations;
    }

    @Transactional(readOnly = true)
    public TableReservation getReservationById(Long id) {
        TableReservation reservation = reservationRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Table reservation not found"));
        initializeSingle(reservation);
        return reservation;
    }

    /* =================== CREATE =================== */

    @Transactional
    public TableReservation createReservation(TableReservation reservation) {
        // Determine restaurant
        Long restaurantId = reservation.getRestaurant() != null ? reservation.getRestaurantId() : null;
        if (restaurantId == null) {
            restaurantId = SecurityUtils.getCurrentRestaurantId();
        }
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }
        Restaurant restaurant = restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found"));
        reservation.setRestaurant(restaurant);

        // Resolve and validate tables
        Set<HallTable> resolvedTables = resolveTables(reservation.getHallTables());
        if (resolvedTables.isEmpty()) {
            throw new BusinessException("Необходимо выбрать хотя бы один столик");
        }
        reservation.setHallTables(resolvedTables);

        // Total capacity check
        int totalCapacity = resolvedTables.stream().mapToInt(HallTable::getCapacity).sum();
        if (reservation.getGuestsCount() != null && reservation.getGuestsCount() > totalCapacity) {
            throw new BusinessException(
                String.format("Суммарная вместимость столиков (%d) меньше количества гостей (%d)",
                    totalCapacity, reservation.getGuestsCount())
            );
        }

        // Time validation
        if (reservation.getStartAt() == null || reservation.getEndAt() == null) {
            throw new BusinessException("Start and end time are required");
        }
        if (!reservation.getEndAt().isAfter(reservation.getStartAt())) {
            throw new BusinessException("Время окончания должно быть позже времени начала");
        }

        // Overlap check for every selected table
        checkOverlap(reservation);

        // Creator
        com.restaurant.security.UserPrincipal user = SecurityUtils.getCurrentUser();
        reservation.setCreatedBy(user != null ? user.getUsername() : "system");

        if (reservation.getStatus() == null) {
            reservation.setStatus(TableReservation.ReservationStatus.CONFIRMED);
        }

        TableReservation saved = reservationRepository.save(reservation);
        initializeSingle(saved);

        String labels = resolvedTables.stream().map(HallTable::getLabel).collect(Collectors.joining(", "));
        log.info("Table reservation created: id={}, tables=[{}], guests={}, start={}, end={}",
            saved.getId(), labels, saved.getGuestsCount(), saved.getStartAt(), saved.getEndAt());
        
        try {
            activityLogService.logActivity(
                "CREATE", "TABLE_RESERVATION", saved.getId(), null,
                String.format("Создано бронирование столиков: [%s], гостей=%d, %s — %s, клиент=%s",
                    labels, saved.getGuestsCount(), saved.getStartAt(), saved.getEndAt(),
                    saved.getCustomerName() != null ? saved.getCustomerName() : "—"),
                null,
                Map.of("tables", labels,
                       "guestsCount", saved.getGuestsCount(),
                       "startAt", saved.getStartAt().toString(),
                       "endAt", saved.getEndAt().toString(),
                       "customerName", saved.getCustomerName() != null ? saved.getCustomerName() : "",
                       "status", saved.getStatus().toString())
            );
        } catch (Exception e) {
            log.error("Failed to log table reservation create: {}", e.getMessage());
        }
        
        return saved;
    }

    /* =================== UPDATE =================== */

    @Transactional
    public TableReservation updateReservation(Long id, TableReservation update) {
        TableReservation existing = reservationRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Table reservation not found"));

        // Update tables if provided
        if (update.getHallTables() != null && !update.getHallTables().isEmpty()) {
            Set<HallTable> resolvedTables = resolveTables(update.getHallTables());
            existing.setHallTables(resolvedTables);
        }

        if (update.getStartAt() != null) existing.setStartAt(update.getStartAt());
        if (update.getEndAt() != null) existing.setEndAt(update.getEndAt());
        if (update.getCustomerName() != null) existing.setCustomerName(update.getCustomerName());
        if (update.getCustomerPhone() != null) existing.setCustomerPhone(update.getCustomerPhone());
        if (update.getGuestsCount() != null) existing.setGuestsCount(update.getGuestsCount());
        if (update.getNotes() != null) existing.setNotes(update.getNotes());
        if (update.getStatus() != null) existing.setStatus(update.getStatus());

        // Total capacity check
        int totalCapacity = existing.getHallTables().stream().mapToInt(HallTable::getCapacity).sum();
        if (existing.getGuestsCount() != null && existing.getGuestsCount() > totalCapacity) {
            throw new BusinessException(
                String.format("Суммарная вместимость столиков (%d) меньше количества гостей (%d)",
                    totalCapacity, existing.getGuestsCount())
            );
        }

        // Time validation
        if (!existing.getEndAt().isAfter(existing.getStartAt())) {
            throw new BusinessException("Время окончания должно быть позже времени начала");
        }

        // Overlap check (excluding current)
        checkOverlap(existing);

        TableReservation saved = reservationRepository.save(existing);
        initializeSingle(saved);
        
        try {
            activityLogService.logActivity(
                "UPDATE", "TABLE_RESERVATION", saved.getId(), null,
                String.format("Обновлено бронирование столиков #%d", saved.getId()),
                null,
                Map.of("tables", saved.getTableLabels() != null ? saved.getTableLabels() : "",
                       "guestsCount", saved.getGuestsCount() != null ? saved.getGuestsCount() : 0,
                       "startAt", saved.getStartAt().toString(),
                       "endAt", saved.getEndAt().toString(),
                       "status", saved.getStatus().toString())
            );
        } catch (Exception e) {
            log.error("Failed to log table reservation update: {}", e.getMessage());
        }
        
        return saved;
    }

    /* =================== CANCEL / COMPLETE =================== */

    @Transactional
    public TableReservation cancelReservation(Long id) {
        TableReservation reservation = reservationRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Table reservation not found"));
        reservation.setStatus(TableReservation.ReservationStatus.CANCELLED);
        reservation.setCancelledAt(com.restaurant.util.TimeUtils.now());
        TableReservation saved = reservationRepository.save(reservation);
        initializeSingle(saved);
        
        try {
            activityLogService.logActivity(
                "CANCEL", "TABLE_RESERVATION", saved.getId(), null,
                String.format("Отменено бронирование столиков #%d", saved.getId()),
                Map.of("status", "CONFIRMED"),
                Map.of("status", "CANCELLED")
            );
        } catch (Exception e) {
            log.error("Failed to log table reservation cancel: {}", e.getMessage());
        }
        
        return saved;
    }

    @Transactional
    public TableReservation completeReservation(Long id) {
        TableReservation reservation = reservationRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Table reservation not found"));
        reservation.setStatus(TableReservation.ReservationStatus.COMPLETED);
        reservation.setCompletedAt(com.restaurant.util.TimeUtils.now());
        TableReservation saved = reservationRepository.save(reservation);
        initializeSingle(saved);
        
        try {
            activityLogService.logActivity(
                "COMPLETE", "TABLE_RESERVATION", saved.getId(), null,
                String.format("Завершено бронирование столиков #%d", saved.getId()),
                Map.of("status", "CONFIRMED"),
                Map.of("status", "COMPLETED")
            );
        } catch (Exception e) {
            log.error("Failed to log table reservation complete: {}", e.getMessage());
        }
        
        return saved;
    }

    /* =================== HELPERS =================== */

    /**
     * Resolve table stubs (with only id) to full entities; validate isActive.
     */
    private Set<HallTable> resolveTables(Set<HallTable> refs) {
        if (refs == null || refs.isEmpty()) return new HashSet<>();
        Set<HallTable> resolved = new LinkedHashSet<>();
        for (HallTable ref : refs) {
            if (ref.getId() == null) continue;
            HallTable table = hallTableRepository.findById(ref.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Столик с ID " + ref.getId() + " не найден"));
            if (!table.getIsActive()) {
                throw new BusinessException("Столик \"" + table.getLabel() + "\" не активен");
            }
            resolved.add(table);
        }
        return resolved;
    }

    private void checkOverlap(TableReservation reservation) {
        Long restaurantId = reservation.getRestaurant().getId();
        Set<Long> tableIds = reservation.getHallTables().stream()
            .map(HallTable::getId)
            .collect(Collectors.toSet());
        if (tableIds.isEmpty()) return;

        List<TableReservation> overlapping = reservationRepository.findOverlappingReservations(
            restaurantId, tableIds, reservation.getStartAt(), reservation.getEndAt()
        );

        // Exclude self when updating
        if (reservation.getId() != null) {
            overlapping.removeIf(r -> r.getId().equals(reservation.getId()));
        }

        if (!overlapping.isEmpty()) {
            TableReservation conflict = overlapping.get(0);
            initializeSingle(conflict);

            Set<Long> conflictTableIds = conflict.getHallTables().stream()
                .map(HallTable::getId)
                .collect(Collectors.toSet());

            String conflictingLabels = reservation.getHallTables().stream()
                .filter(t -> conflictTableIds.contains(t.getId()))
                .map(HallTable::getLabel)
                .sorted()
                .collect(Collectors.joining(", "));

            throw new BusinessException(
                String.format("Столик(и) %s уже забронирован(ы) на %s — %s (%s)",
                    conflictingLabels,
                    formatDateTime(conflict.getStartAt()),
                    formatDateTime(conflict.getEndAt()),
                    conflict.getCustomerName() != null ? conflict.getCustomerName() : "без имени")
            );
        }
    }

    private String formatDateTime(LocalDateTime dt) {
        return dt.toLocalDate() + " " + dt.toLocalTime().toString().substring(0, 5);
    }

    private void initializeSingle(TableReservation r) {
        if (r.getRestaurant() != null) r.getRestaurant().getName();
        if (r.getHallTables() != null) {
            r.getHallTables().forEach(t -> {
                t.getLabel();
                t.getCapacity();
            });
        }
    }

    private void initializeLazyFields(List<TableReservation> reservations) {
        for (TableReservation r : reservations) {
            initializeSingle(r);
        }
    }
}
