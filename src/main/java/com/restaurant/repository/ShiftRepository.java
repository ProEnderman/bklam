package com.restaurant.repository;

import com.restaurant.model.Shift;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface ShiftRepository extends JpaRepository<Shift, Long> {
    
    List<Shift> findByEmployeeId(Long employeeId);
    
    List<Shift> findByRestaurantId(Long restaurantId);
    
    List<Shift> findByEmployeeIdAndRestaurantId(Long employeeId, Long restaurantId);
    
    @Query("SELECT s FROM Shift s WHERE " +
           "s.restaurant.id = :restaurantId AND " +
           "((s.startTime <= :startTime AND s.endTime > :startTime) OR " +
           "(s.startTime < :endTime AND s.endTime >= :endTime) OR " +
           "(s.startTime >= :startTime AND s.endTime <= :endTime))")
    List<Shift> findConflictingShifts(
        @Param("restaurantId") Long restaurantId,
        @Param("startTime") LocalDateTime startTime,
        @Param("endTime") LocalDateTime endTime
    );
    
    @Query("SELECT s FROM Shift s WHERE " +
           "s.employee.id = :employeeId AND " +
           "((s.startTime <= :startTime AND s.endTime > :startTime) OR " +
           "(s.startTime < :endTime AND s.endTime >= :endTime) OR " +
           "(s.startTime >= :startTime AND s.endTime <= :endTime))")
    List<Shift> findConflictingShiftsForEmployee(
        @Param("employeeId") Long employeeId,
        @Param("startTime") LocalDateTime startTime,
        @Param("endTime") LocalDateTime endTime
    );
}




