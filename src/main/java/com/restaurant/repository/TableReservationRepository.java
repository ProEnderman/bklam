package com.restaurant.repository;

import com.restaurant.model.TableReservation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

@Repository
public interface TableReservationRepository extends JpaRepository<TableReservation, Long> {

    /**
     * Найти бронирования, которые пересекаются по времени
     * хотя бы с одним из переданных столиков.
     */
    @Query("SELECT DISTINCT r FROM TableReservation r JOIN r.hallTables ht WHERE " +
           "r.restaurant.id = :restaurantId AND " +
           "ht.id IN :tableIds AND " +
           "r.status = 'CONFIRMED' AND " +
           "r.startAt < :endAt AND r.endAt > :startAt " +
           "ORDER BY r.startAt")
    List<TableReservation> findOverlappingReservations(
        @Param("restaurantId") Long restaurantId,
        @Param("tableIds") Collection<Long> tableIds,
        @Param("startAt") LocalDateTime startAt,
        @Param("endAt") LocalDateTime endAt
    );

    /**
     * Найти бронирования за период с фильтрами.
     */
    @Query("SELECT DISTINCT r FROM TableReservation r LEFT JOIN r.hallTables ht WHERE " +
           "r.restaurant.id = :restaurantId AND " +
           "(:tableId IS NULL OR ht.id = :tableId) AND " +
           "(:status IS NULL OR r.status = :status) AND " +
           "r.startAt >= :fromDate AND r.startAt <= :toDate " +
           "ORDER BY r.startAt")
    List<TableReservation> findReservations(
        @Param("restaurantId") Long restaurantId,
        @Param("tableId") Long tableId,
        @Param("status") TableReservation.ReservationStatus status,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate
    );

    /**
     * Все бронирования ресторана (без фильтра по дате).
     */
    @Query("SELECT DISTINCT r FROM TableReservation r LEFT JOIN r.hallTables ht WHERE " +
           "r.restaurant.id = :restaurantId AND " +
           "(:tableId IS NULL OR ht.id = :tableId) AND " +
           "(:status IS NULL OR r.status = :status) " +
           "ORDER BY r.startAt DESC")
    List<TableReservation> findAllByRestaurant(
        @Param("restaurantId") Long restaurantId,
        @Param("tableId") Long tableId,
        @Param("status") TableReservation.ReservationStatus status
    );
}
