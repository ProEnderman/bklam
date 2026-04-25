package com.restaurant.repository;

import com.restaurant.model.BookingNotification;
import com.restaurant.model.BookingNotification.NotificationStatus;
import com.restaurant.model.BookingNotification.NotificationType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BookingNotificationRepository extends JpaRepository<BookingNotification, Long> {

    /**
     * Найти все уведомления для ресторана по статусу
     */
    @Query("SELECT n FROM BookingNotification n WHERE n.restaurantId = :restaurantId AND n.status = :status ORDER BY n.createdAt DESC")
    List<BookingNotification> findByRestaurantIdAndStatus(
        @Param("restaurantId") Long restaurantId,
        @Param("status") NotificationStatus status
    );

    /**
     * Найти все уведомления для ресторана (все статусы)
     */
    @Query("SELECT n FROM BookingNotification n WHERE n.restaurantId = :restaurantId ORDER BY n.createdAt DESC")
    List<BookingNotification> findByRestaurantId(@Param("restaurantId") Long restaurantId);

    /**
     * Подсчитать непрочитанные уведомления
     */
    @Query("SELECT COUNT(n) FROM BookingNotification n WHERE n.restaurantId = :restaurantId AND n.status = 'PENDING'")
    long countPending(@Param("restaurantId") Long restaurantId);

    /**
     * Проверить, существует ли уведомление определённого типа для бронирования
     */
    @Query("SELECT CASE WHEN COUNT(n) > 0 THEN TRUE ELSE FALSE END FROM BookingNotification n " +
           "WHERE n.booking.id = :bookingId AND n.notificationType = :type")
    boolean existsByBookingIdAndType(
        @Param("bookingId") Long bookingId,
        @Param("type") NotificationType type
    );

    /**
     * Найти PENDING уведомления для конкретного бронирования (с JOIN FETCH booking)
     */
    @Query("SELECT n FROM BookingNotification n JOIN FETCH n.booking WHERE n.booking.id = :bookingId AND n.status = 'PENDING'")
    List<BookingNotification> findPendingByBookingId(@Param("bookingId") Long bookingId);

    /**
     * Найти все PENDING уведомления (с JOIN FETCH booking для авто-очистки по статусу)
     */
    @Query("SELECT n FROM BookingNotification n JOIN FETCH n.booking WHERE n.status = 'PENDING'")
    List<BookingNotification> findAllPending();
}
