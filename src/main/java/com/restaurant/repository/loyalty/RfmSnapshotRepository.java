package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.RfmSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface RfmSnapshotRepository extends JpaRepository<RfmSnapshot, Long> {

    @Query("SELECT r FROM RfmSnapshot r WHERE r.guest.id = :guestId ORDER BY r.snapshotDate DESC LIMIT 1")
    Optional<RfmSnapshot> findLatestByGuestId(@Param("guestId") Long guestId);

    @Query("SELECT r FROM RfmSnapshot r WHERE r.guest.id = :guestId ORDER BY r.snapshotDate DESC")
    List<RfmSnapshot> findByGuestIdOrderBySnapshotDateDesc(@Param("guestId") Long guestId);

    @Query("SELECT r FROM RfmSnapshot r WHERE r.guest.restaurant.id = :restaurantId AND r.snapshotDate = :date")
    List<RfmSnapshot> findByRestaurantAndDate(@Param("restaurantId") Long restaurantId, @Param("date") LocalDate date);

    @Query("SELECT r.rfmSegment, COUNT(r) FROM RfmSnapshot r " +
           "WHERE r.guest.restaurant.id = :restaurantId AND r.snapshotDate = :date " +
           "GROUP BY r.rfmSegment")
    List<Object[]> countBySegment(@Param("restaurantId") Long restaurantId, @Param("date") LocalDate date);
}
