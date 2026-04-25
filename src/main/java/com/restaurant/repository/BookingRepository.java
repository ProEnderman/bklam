package com.restaurant.repository;

import com.restaurant.model.Booking;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

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
}




