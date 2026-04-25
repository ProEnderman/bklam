package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.GuestTierHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GuestTierHistoryRepository extends JpaRepository<GuestTierHistory, Long> {

    @Query("SELECT h FROM GuestTierHistory h WHERE h.guest.id = :guestId ORDER BY h.assignedAt DESC")
    List<GuestTierHistory> findByGuestIdOrderByAssignedAtDesc(@Param("guestId") Long guestId);

    @Query("SELECT h FROM GuestTierHistory h WHERE h.guest.id = :guestId ORDER BY h.assignedAt DESC LIMIT 1")
    Optional<GuestTierHistory> findCurrentTier(@Param("guestId") Long guestId);
}
