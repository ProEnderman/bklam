package com.restaurant.repository;

import com.restaurant.model.Calendar;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CalendarRepository extends JpaRepository<Calendar, Long> {
    
    List<Calendar> findByOrganizationId(Long organizationId);
    
    List<Calendar> findByBranchId(Long branchId);
    
    @Query("SELECT c FROM Calendar c WHERE (:organizationId IS NULL OR c.organizationId = :organizationId) " +
           "AND (:branchId IS NULL OR c.branch.id = :branchId)")
    List<Calendar> findByOrganizationIdAndBranchId(@Param("organizationId") Long organizationId, 
                                                    @Param("branchId") Long branchId);
    
    @Query("SELECT COUNT(t) > 0 FROM TariffPlan t WHERE t.calendar.id = :calendarId")
    boolean isUsedByAnyTariff(@Param("calendarId") Long calendarId);
}




