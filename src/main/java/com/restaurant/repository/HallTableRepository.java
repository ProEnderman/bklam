package com.restaurant.repository;

import com.restaurant.model.HallTable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface HallTableRepository extends JpaRepository<HallTable, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM HallTable t WHERE t.id = :id")
    Optional<HallTable> findByIdForUpdate(@Param("id") Long id);
    @Query("SELECT t FROM HallTable t WHERE t.restaurant.id = :restaurantId ORDER BY t.label ASC")
    List<HallTable> findByRestaurantIdOrderByLabelAsc(@Param("restaurantId") Long restaurantId);

    @Query("SELECT t FROM HallTable t WHERE t.restaurant.id = :restaurantId AND t.label = :label")
    Optional<HallTable> findByRestaurantIdAndLabel(@Param("restaurantId") Long restaurantId, @Param("label") String label);

    /**
     * Возвращает только активные столики, которые реально размещены на карте зала.
     */
    @Query("SELECT DISTINCT t FROM HallTable t " +
           "JOIN HallPlacedItem pi ON pi.table.id = t.id " +
           "JOIN HallMap m ON pi.hallMap.id = m.id " +
           "WHERE m.restaurant.id = :restaurantId AND t.isActive = true " +
           "ORDER BY t.label ASC")
    List<HallTable> findActiveTablesOnMap(@Param("restaurantId") Long restaurantId);
}


