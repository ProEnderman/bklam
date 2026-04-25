package com.restaurant.repository;

import com.restaurant.model.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@org.springframework.stereotype.Repository
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    List<OutboxEvent> findByStatusOrderByCreatedAtDesc(String status, org.springframework.data.domain.Pageable pageable);

    @Query("SELECT e FROM OutboxEvent e WHERE e.status = 'PROCESSING' AND e.claimedAt < :cutoff")
    List<OutboxEvent> findStuckProcessing(@Param("cutoff") Instant cutoff);

    long countByStatus(String status);
}
