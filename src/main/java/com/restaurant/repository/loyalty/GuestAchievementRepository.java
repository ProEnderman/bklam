package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.GuestAchievement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GuestAchievementRepository extends JpaRepository<GuestAchievement, Long> {

    @Query("SELECT ga FROM GuestAchievement ga WHERE ga.guest.id = :guestId")
    List<GuestAchievement> findByGuestId(@Param("guestId") Long guestId);

    @Query("SELECT CASE WHEN COUNT(ga) > 0 THEN true ELSE false END FROM GuestAchievement ga WHERE ga.guest.id = :guestId AND ga.achievement.id = :achievementId")
    boolean existsByGuestIdAndAchievementId(@Param("guestId") Long guestId, @Param("achievementId") Long achievementId);
}
