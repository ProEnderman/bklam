package com.restaurant.repository;

import com.restaurant.model.ActivityLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface ActivityLogRepository extends JpaRepository<ActivityLog, Long> {
    
    @Query("SELECT a FROM ActivityLog a WHERE " +
           "(:actionType IS NULL OR a.actionType = :actionType) AND " +
           "(:entityType IS NULL OR a.entityType = :entityType) AND " +
           "(:entityId IS NULL OR a.entityId = :entityId) AND " +
           "(:userName IS NULL OR a.userName = :userName) AND " +
           "a.createdAt >= :fromDate AND " +
           "a.createdAt <= :toDate " +
           "ORDER BY a.createdAt DESC")
    Page<ActivityLog> findActivities(
        @Param("actionType") String actionType,
        @Param("entityType") String entityType,
        @Param("entityId") Long entityId,
        @Param("userName") String userName,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        Pageable pageable
    );
    
    @Query("SELECT DISTINCT a.actionType FROM ActivityLog a ORDER BY a.actionType")
    List<String> findDistinctActionTypes();
    
    @Query("SELECT DISTINCT a.entityType FROM ActivityLog a " +
           "WHERE (:actionType IS NULL OR a.actionType = :actionType) " +
           "ORDER BY a.entityType")
    List<String> findDistinctEntityTypes(@Param("actionType") String actionType);
    
    @Query("SELECT DISTINCT a.userName FROM ActivityLog a " +
           "WHERE (:actionType IS NULL OR a.actionType = :actionType) AND " +
           "(:entityType IS NULL OR a.entityType = :entityType) " +
           "ORDER BY a.userName")
    List<String> findDistinctUserNames(
        @Param("actionType") String actionType,
        @Param("entityType") String entityType
    );
}

