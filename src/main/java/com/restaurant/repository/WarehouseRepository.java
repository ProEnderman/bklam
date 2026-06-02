package com.restaurant.repository;

import com.restaurant.model.Warehouse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WarehouseRepository extends JpaRepository<Warehouse, Long> {
    @Query("SELECT w FROM Warehouse w JOIN FETCH w.location WHERE w.location.id = :locationId")
    List<Warehouse> findByLocationId(@Param("locationId") Long locationId);
}
