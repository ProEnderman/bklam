package com.restaurant.repository;

import com.restaurant.model.LegalEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LegalEntityRepository extends JpaRepository<LegalEntity, Long> {
    @Query("SELECT e FROM LegalEntity e JOIN FETCH e.holding WHERE e.holding.id = :holdingId")
    List<LegalEntity> findByHoldingId(@Param("holdingId") Long holdingId);
}
