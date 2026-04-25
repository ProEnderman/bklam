package com.restaurant.repository;

import com.restaurant.model.Activity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ActivityRepository extends JpaRepository<Activity, Long> {
    
    @Query("SELECT a FROM Activity a WHERE a.branch.id = :branchId AND a.status = :status")
    List<Activity> findByBranchIdAndStatus(@Param("branchId") Long branchId, @Param("status") Activity.ActivityStatus status);
    
    @Query("SELECT a FROM Activity a WHERE " +
           "(:branchId IS NULL OR a.branch.id = :branchId) AND " +
           "(:status IS NULL OR a.status = :status)")
    List<Activity> findActivities(
        @Param("branchId") Long branchId,
        @Param("status") Activity.ActivityStatus status
    );

    @Query("SELECT CASE WHEN COUNT(a) > 0 THEN TRUE ELSE FALSE END FROM Activity a " +
           "WHERE a.gapFiller = true AND a.status = 'ACTIVE'")
    boolean existsActiveGapFiller();
}



