package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.Segment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SegmentRepository extends JpaRepository<Segment, Long> {

    @Query("SELECT s FROM Segment s WHERE s.restaurant.id = :restaurantId")
    List<Segment> findByRestaurantId(@Param("restaurantId") Long restaurantId);
}
