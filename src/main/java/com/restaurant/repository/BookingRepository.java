package com.restaurant.repository;

import com.restaurant.model.Booking;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Collection;
import java.util.Optional;

@Repository
public interface BookingRepository extends JpaRepository<Booking, Long> {
    
    // Найти все бронирования, которые пересекаются с указанным временным интервалом
    @Query("SELECT b FROM Booking b WHERE " +
           "b.branch.id = :branchId AND " +
           "b.activity.id = :activityId AND " +
           "b.status IN :statuses AND " +
           "(:resourceId IS NULL OR b.resource.id = :resourceId) AND " +
           "((b.startAt < :endAt AND b.endAt > :startAt)) " +
           "ORDER BY b.startAt")
    List<Booking> findOverlappingBookings(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("resourceId") Long resourceId,
        @Param("startAt") LocalDateTime startAt,
        @Param("endAt") LocalDateTime endAt,
        @Param("statuses") List<Booking.BookingStatus> statuses
    );

    /** Все брони филиала, пересекающие интервал (любое мероприятие) — для проверки «полной брони». */
    @Query("SELECT b FROM Booking b JOIN FETCH b.activity act WHERE b.branch.id = :branchId AND b.status IN :statuses AND " +
           "b.startAt < :endAt AND b.endAt > :startAt ORDER BY b.startAt")
    List<Booking> findOverlappingBookingsBranchWide(
        @Param("branchId") Long branchId,
        @Param("startAt") LocalDateTime startAt,
        @Param("endAt") LocalDateTime endAt,
        @Param("statuses") List<Booking.BookingStatus> statuses
    );

    /** Активные полные брони (мероприятия с fullVenueLock) за период — календарь занятости. */
    @Query("SELECT b FROM Booking b JOIN FETCH b.activity act WHERE b.branch.id = :branchId AND act.fullVenueLock = true AND b.status IN :statuses AND " +
           "b.startAt < :to AND b.endAt > :from ORDER BY b.startAt")
    List<Booking> findFullVenueBookingsOverlapping(
        @Param("branchId") Long branchId,
        @Param("from") LocalDateTime from,
        @Param("to") LocalDateTime to,
        @Param("statuses") List<Booking.BookingStatus> statuses
    );
    
    // Найти все бронирования за период
    @Query("SELECT b FROM Booking b WHERE " +
           "(:branchId IS NULL OR b.branch.id = :branchId) AND " +
           "(:activityId IS NULL OR b.activity.id = :activityId) AND " +
           "(:status IS NULL OR b.status = :status) AND " +
           "b.startAt >= :fromDate AND b.startAt <= :toDate " +
           "ORDER BY b.startAt")
    List<Booking> findBookings(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("status") Booking.BookingStatus status,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate
    );

    /** Для планировщика напоминаний: загрузка с activity, чтобы не было LazyInitializationException вне сессии. */
    @Query("SELECT DISTINCT b FROM Booking b LEFT JOIN FETCH b.activity WHERE " +
           "(:branchId IS NULL OR b.branch.id = :branchId) AND " +
           "(:activityId IS NULL OR b.activity.id = :activityId) AND " +
           "(:status IS NULL OR b.status = :status) AND " +
           "b.startAt >= :fromDate AND b.startAt <= :toDate ORDER BY b.startAt")
    List<Booking> findBookingsWithActivityFetch(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("status") Booking.BookingStatus status,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate
    );

    @Query("SELECT b FROM Booking b WHERE " +
           "(:branchId IS NULL OR b.branch.id = :branchId) AND " +
           "(:activityId IS NULL OR b.activity.id = :activityId) AND " +
           "(:status IS NULL OR b.status = :status) AND " +
           "b.startAt >= :fromDate AND b.startAt <= :toDate")
    Page<Booking> findBookingsPage(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("status") Booking.BookingStatus status,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        Pageable pageable
    );

    @Query("SELECT b FROM Booking b WHERE " +
           "(:branchId IS NULL OR b.branch.id = :branchId) AND " +
           "(:activityId IS NULL OR b.activity.id = :activityId) AND " +
           "b.status IN :statuses AND " +
           "b.startAt >= :fromDate AND b.startAt <= :toDate")
    Page<Booking> findBookingsPageByStatusIn(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("statuses") Collection<Booking.BookingStatus> statuses,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        Pageable pageable
    );

    @Query("SELECT b FROM Booking b WHERE " +
           "(:branchId IS NULL OR b.branch.id = :branchId) AND " +
           "(:activityId IS NULL OR b.activity.id = :activityId) AND " +
           "b.status IN :statuses AND " +
           "b.startAt >= :fromDate AND b.startAt <= :toDate AND " +
           "(:customerSearch IS NULL OR :customerSearch = '' OR " +
           " (LOWER(b.customerName) LIKE LOWER(CONCAT('%', :customerSearch, '%')) OR " +
           "  LOWER(b.customerPhone) LIKE LOWER(CONCAT('%', :customerSearch, '%'))))")
    Page<Booking> findBookingsPageByStatusInAndCustomerSearch(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("statuses") Collection<Booking.BookingStatus> statuses,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        @Param("customerSearch") String customerSearch,
        Pageable pageable
    );

    // Найти пересекающиеся бронирования ДРУГОГО клиента по имени+телефону (кросс-активности)
    @Query("SELECT b FROM Booking b WHERE " +
           "b.branch.id = :branchId AND " +
           "b.customerName = :customerName AND " +
           "b.customerPhone = :customerPhone AND " +
           "b.status IN :statuses AND " +
           "b.startAt < :endAt AND b.endAt > :startAt " +
           "ORDER BY b.startAt")
    List<Booking> findOverlappingByCustomer(
        @Param("branchId") Long branchId,
        @Param("customerName") String customerName,
        @Param("customerPhone") String customerPhone,
        @Param("startAt") LocalDateTime startAt,
        @Param("endAt") LocalDateTime endAt,
        @Param("statuses") List<Booking.BookingStatus> statuses
    );

    // Подсчитать количество пересекающихся бронирований
    @Query("SELECT COUNT(b) FROM Booking b WHERE " +
           "b.branch.id = :branchId AND " +
           "b.activity.id = :activityId AND " +
           "b.status IN :statuses AND " +
           "(:resourceId IS NULL OR b.resource.id = :resourceId) AND " +
           "((b.startAt < :endAt AND b.endAt > :startAt))")
    long countOverlappingBookings(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("resourceId") Long resourceId,
        @Param("startAt") LocalDateTime startAt,
        @Param("endAt") LocalDateTime endAt,
        @Param("statuses") List<Booking.BookingStatus> statuses
    );

    /** Дата начала самой первой брони по филиалу (для аналитики «история ресторана»). */
    @Query("SELECT MIN(b.startAt) FROM Booking b WHERE b.branch.id = :branchId")
    Optional<LocalDateTime> findEarliestStartAtByBranchId(@Param("branchId") Long branchId);

    /** Бронирования, привязанные к заказу. */
    List<Booking> findByBookingOrder_Id(Long bookingOrderId);

    @Query("SELECT b FROM Booking b WHERE " +
           "(:branchId IS NULL OR b.branch.id = :branchId) AND " +
           "(:activityId IS NULL OR b.activity.id = :activityId) AND " +
           "b.status IN :statuses AND " +
           "b.startAt >= :fromDate AND b.startAt <= :toDate AND " +
           "b.bookingOrder IS NOT NULL")
    Page<Booking> findBookingsPageByStatusInLinkedToOrder(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("statuses") Collection<Booking.BookingStatus> statuses,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        Pageable pageable
    );

    @Query("SELECT b FROM Booking b WHERE " +
           "(:branchId IS NULL OR b.branch.id = :branchId) AND " +
           "(:activityId IS NULL OR b.activity.id = :activityId) AND " +
           "b.status IN :statuses AND " +
           "b.startAt >= :fromDate AND b.startAt <= :toDate AND " +
           "b.bookingOrder IS NOT NULL AND " +
           "(:customerSearch IS NULL OR :customerSearch = '' OR " +
           " (LOWER(b.customerName) LIKE LOWER(CONCAT('%', :customerSearch, '%')) OR " +
           "  LOWER(b.customerPhone) LIKE LOWER(CONCAT('%', :customerSearch, '%'))))")
    Page<Booking> findBookingsPageByStatusInAndCustomerSearchLinkedToOrder(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("statuses") Collection<Booking.BookingStatus> statuses,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        @Param("customerSearch") String customerSearch,
        Pageable pageable
    );

    @Query("SELECT b FROM Booking b WHERE " +
           "(:branchId IS NULL OR b.branch.id = :branchId) AND " +
           "(:activityId IS NULL OR b.activity.id = :activityId) AND " +
           "b.status IN :statuses AND " +
           "b.startAt >= :fromDate AND b.startAt <= :toDate AND " +
           "b.bookingOrder IS NULL")
    Page<Booking> findBookingsPageByStatusInNotLinkedToOrder(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("statuses") Collection<Booking.BookingStatus> statuses,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        Pageable pageable
    );

    @Query("SELECT b FROM Booking b WHERE " +
           "(:branchId IS NULL OR b.branch.id = :branchId) AND " +
           "(:activityId IS NULL OR b.activity.id = :activityId) AND " +
           "b.status IN :statuses AND " +
           "b.startAt >= :fromDate AND b.startAt <= :toDate AND " +
           "b.bookingOrder IS NULL AND " +
           "(:customerSearch IS NULL OR :customerSearch = '' OR " +
           " (LOWER(b.customerName) LIKE LOWER(CONCAT('%', :customerSearch, '%')) OR " +
           "  LOWER(b.customerPhone) LIKE LOWER(CONCAT('%', :customerSearch, '%'))))")
    Page<Booking> findBookingsPageByStatusInAndCustomerSearchNotLinkedToOrder(
        @Param("branchId") Long branchId,
        @Param("activityId") Long activityId,
        @Param("statuses") Collection<Booking.BookingStatus> statuses,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        @Param("customerSearch") String customerSearch,
        Pageable pageable
    );

    /** Бронирования филиала по имени и телефону клиента (для dissolve группы). */
    @Query("SELECT b FROM Booking b WHERE b.branch.id = :branchId AND b.status <> :excludeStatus AND " +
           "((:customerName = '' AND (b.customerName IS NULL OR b.customerName = '')) OR b.customerName = :customerName) AND " +
           "((:customerPhone = '' AND (b.customerPhone IS NULL OR b.customerPhone = '')) OR b.customerPhone = :customerPhone)")
    List<Booking> findByBranchAndCustomer(
        @Param("branchId") Long branchId,
        @Param("customerName") String customerName,
        @Param("customerPhone") String customerPhone,
        @Param("excludeStatus") Booking.BookingStatus excludeStatus
    );

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM Booking b WHERE b.branch.id = :branchId AND b.customerName LIKE :clientPrefix")
    int deleteDemoSeedBookingsByClientPrefix(
        @Param("branchId") Long branchId,
        @Param("clientPrefix") String clientPrefix
    );

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM Booking b WHERE b.branch.id = :branchId AND b.activity.id IN :activityIds")
    int deleteBookingsByActivityIds(
        @Param("branchId") Long branchId,
        @Param("activityIds") List<Long> activityIds
    );

    /** Demo seed: {@code Booking.createdAt} is {@code updatable = false} in JPA. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
        UPDATE bookings
        SET created_at = :createdAt,
            paid_at = :paidAt,
            cancelled_at = :cancelledAt
        WHERE id = :id
        """, nativeQuery = true)
    int updateBookingTimestamps(
        @Param("id") Long id,
        @Param("createdAt") LocalDateTime createdAt,
        @Param("paidAt") LocalDateTime paidAt,
        @Param("cancelledAt") LocalDateTime cancelledAt
    );

    /** Forecast training: PAID bookings per calendar day (by {@code start_at}). */
    @Query(value = """
        SELECT CAST(b.start_at AS date) AS day, COUNT(*) AS cnt
        FROM bookings b
        WHERE b.branch_id = :branchId AND b.status = 'PAID'
          AND b.start_at >= CAST(:fromDate AS timestamp)
          AND b.start_at < CAST(:toDate AS timestamp) + INTERVAL '1 day'
        GROUP BY CAST(b.start_at AS date)
        ORDER BY 1
        """, nativeQuery = true)
    List<Object[]> findDailyPaidBookingCounts(
        @Param("branchId") Long branchId,
        @Param("fromDate") LocalDate fromDate,
        @Param("toDate") LocalDate toDate
    );

    @Query(value = """
        SELECT b.activity_id, a.name, CAST(b.start_at AS date) AS day, COUNT(*) AS cnt
        FROM bookings b
        JOIN activities a ON a.id = b.activity_id
        WHERE b.branch_id = :branchId AND b.status = 'PAID'
          AND b.start_at >= CAST(:fromDate AS timestamp)
          AND b.start_at < CAST(:toDate AS timestamp) + INTERVAL '1 day'
        GROUP BY b.activity_id, a.name, CAST(b.start_at AS date)
        ORDER BY 1, 3
        """, nativeQuery = true)
    List<Object[]> findDailyPaidBookingCountsByActivity(
        @Param("branchId") Long branchId,
        @Param("fromDate") LocalDate fromDate,
        @Param("toDate") LocalDate toDate
    );

    /** Forecast training: PAID tariff booking revenue per calendar day (by {@code start_at}). */
    @Query(value = """
        SELECT CAST(b.start_at AS date) AS day, COALESCE(SUM(b.total_amount), 0) AS revenue
        FROM bookings b
        WHERE b.branch_id = :branchId AND b.status = 'PAID'
          AND b.start_at >= CAST(:fromDate AS timestamp)
          AND b.start_at < CAST(:toDate AS timestamp) + INTERVAL '1 day'
        GROUP BY CAST(b.start_at AS date)
        ORDER BY 1
        """, nativeQuery = true)
    List<Object[]> findDailyPaidBookingRevenue(
        @Param("branchId") Long branchId,
        @Param("fromDate") LocalDate fromDate,
        @Param("toDate") LocalDate toDate
    );
}




