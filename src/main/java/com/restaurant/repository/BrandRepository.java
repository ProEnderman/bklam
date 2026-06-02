package com.restaurant.repository;

import com.restaurant.model.Brand;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BrandRepository extends JpaRepository<Brand, Long> {
    @Query("SELECT b FROM Brand b JOIN FETCH b.holding WHERE b.holding.id = :holdingId")
    List<Brand> findByHoldingId(@Param("holdingId") Long holdingId);
}
