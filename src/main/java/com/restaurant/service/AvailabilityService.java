package com.restaurant.service;

import com.restaurant.model.Activity;
import com.restaurant.model.Booking;
import com.restaurant.repository.BookingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class AvailabilityService {
    
    private final BookingRepository bookingRepository;

    private static final List<Booking.BookingStatus> FULL_VENUE_CALENDAR_STATUSES =
        List.of(Booking.BookingStatus.DRAFT, Booking.BookingStatus.CONFIRMED, Booking.BookingStatus.PAID, Booking.BookingStatus.COMPLETED);
    
    /**
     * Проверка доступности и занятости
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getAvailability(Long branchId, Long activityId, 
                                                LocalDateTime from, LocalDateTime to) {
        // Подтверждённые брони выбранного мероприятия
        List<Booking> bookings = bookingRepository.findBookings(
            branchId,
            activityId,
            Booking.BookingStatus.CONFIRMED,
            from,
            to
        );
        // Полные брони любых мероприятий филиала — занимают площадку для всех (отображение и свободные слоты)
        List<Booking> fullVenueBookings = bookingRepository.findFullVenueBookingsOverlapping(
            branchId, from, to, FULL_VENUE_CALENDAR_STATUSES);

        List<Booking> mergedForSlots = new ArrayList<>(bookings);
        Set<Long> seen = new HashSet<>();
        for (Booking b : bookings) {
            seen.add(b.getId());
        }
        for (Booking b : fullVenueBookings) {
            if (!seen.contains(b.getId())) {
                mergedForSlots.add(b);
                seen.add(b.getId());
            }
        }

        Map<String, Integer> hourlyOccupancy = new HashMap<>();
        for (Booking booking : mergedForSlots) {
            LocalDateTime bookingStart = booking.getStartAt();
            LocalDateTime bookingEnd = booking.getEndAt();
            LocalDateTime current = bookingStart;
            while (current.isBefore(bookingEnd) && current.isBefore(to)) {
                String hourKey = current.toLocalDate().toString() + "T" + 
                    String.format("%02d:00", current.getHour());
                hourlyOccupancy.merge(hourKey, 1, Integer::sum);
                current = current.plusHours(1);
            }
        }
        
        List<Map<String, Object>> freeSlots = findFreeSlots(branchId, activityId, from, to, mergedForSlots);
        
        Map<String, Object> result = new HashMap<>();
        result.put("occupancy", hourlyOccupancy);
        result.put("freeSlots", freeSlots);
        result.put("totalBookings", bookings.size());

        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
        List<Map<String, Object>> fvBlocks = new ArrayList<>();
        for (Booking b : fullVenueBookings) {
            Activity act = b.getActivity();
            String name = act != null ? act.getName() : "—";
            Map<String, Object> row = new HashMap<>();
            row.put("bookingId", b.getId());
            row.put("activityId", act != null ? act.getId() : null);
            row.put("activityName", name);
            row.put("startAt", b.getStartAt());
            row.put("endAt", b.getEndAt());
            row.put("message", String.format(
                "С %s по %s активна полная бронь «%s» — другие мероприятия в этот период недоступны.",
                fmt.format(b.getStartAt()), fmt.format(b.getEndAt()), name));
            fvBlocks.add(row);
        }
        result.put("fullVenueBlocks", fvBlocks);
        
        return result;
    }
    
    private List<Map<String, Object>> findFreeSlots(Long branchId, Long activityId, 
                                                     LocalDateTime from, LocalDateTime to,
                                                     List<Booking> existingBookings) {
        List<Map<String, Object>> freeSlots = new ArrayList<>();
        
        // Упрощённая логика: ищем интервалы по 1 часу
        LocalDateTime current = from;
        while (current.isBefore(to)) {
            final LocalDateTime slotStart = current;
            LocalDateTime slotEnd = current.plusHours(1);
            final LocalDateTime slotEndFinal = slotEnd;
            
            // Проверяем, есть ли пересечения
            boolean isFree = existingBookings.stream().noneMatch(booking ->
                booking.getStartAt().isBefore(slotEndFinal) && booking.getEndAt().isAfter(slotStart)
            );
            
            if (isFree) {
                Map<String, Object> slot = new HashMap<>();
                slot.put("start", slotStart);
                slot.put("end", slotEndFinal);
                freeSlots.add(slot);
            }
            
            current = current.plusHours(1);
        }
        
        return freeSlots;
    }
}

