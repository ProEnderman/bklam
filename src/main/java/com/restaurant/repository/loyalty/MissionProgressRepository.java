package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.MissionProgress;
import com.restaurant.model.loyalty.MissionProgressStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MissionProgressRepository extends JpaRepository<MissionProgress, Long> {

    @Query("SELECT mp FROM MissionProgress mp WHERE mp.guest.id = :guestId")
    List<MissionProgress> findByGuestId(@Param("guestId") Long guestId);

    @Query("SELECT mp FROM MissionProgress mp WHERE mp.guest.id = :guestId AND mp.status = :status")
    List<MissionProgress> findByGuestIdAndStatus(@Param("guestId") Long guestId, @Param("status") MissionProgressStatus status);

    @Query("SELECT mp FROM MissionProgress mp WHERE mp.guest.id = :guestId AND mp.mission.id = :missionId")
    Optional<MissionProgress> findByGuestIdAndMissionId(@Param("guestId") Long guestId, @Param("missionId") Long missionId);
}
