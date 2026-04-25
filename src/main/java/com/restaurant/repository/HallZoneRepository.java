package com.restaurant.repository;

import com.restaurant.model.HallZone;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HallZoneRepository extends JpaRepository<HallZone, Long> {
    @Query("SELECT z FROM HallZone z WHERE z.hallMap.id = :hallMapId ORDER BY z.id ASC")
    List<HallZone> findByHallMapIdOrderByIdAsc(@Param("hallMapId") Long hallMapId);
}


