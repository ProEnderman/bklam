package com.restaurant.dto;

import com.restaurant.model.BookingNotification;

import java.time.LocalDateTime;

public record BookingNotificationDto(
    Long id,
    Long restaurantId,
    Long bookingId,
    String notificationType,
    String title,
    String message,
    String status,
    String response,
    LocalDateTime createdAt,
    LocalDateTime resolvedAt,
    String resolvedBy,
    // Дополнительные поля из бронирования
    String customerName,
    String customerPhone,
    String activityName,
    LocalDateTime bookingStartAt,
    LocalDateTime bookingEndAt,
    String bookingStatus
) {
    public static BookingNotificationDto fromEntity(BookingNotification n) {
        var booking = n.getBooking();
        return new BookingNotificationDto(
            n.getId(),
            n.getRestaurantId(),
            n.getBookingId(),
            n.getNotificationType() != null ? n.getNotificationType().name() : null,
            n.getTitle(),
            n.getMessage(),
            n.getStatus() != null ? n.getStatus().name() : null,
            n.getResponse() != null ? n.getResponse().name() : null,
            n.getCreatedAt(),
            n.getResolvedAt(),
            n.getResolvedBy(),
            booking != null ? booking.getCustomerName() : null,
            booking != null ? booking.getCustomerPhone() : null,
            booking != null && booking.getActivity() != null ? booking.getActivity().getName() : null,
            booking != null ? booking.getStartAt() : null,
            booking != null ? booking.getEndAt() : null,
            booking != null ? booking.getStatus().name() : null
        );
    }
}
