package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.Campaign;
import com.restaurant.model.loyalty.CampaignStatus;
import com.restaurant.model.loyalty.CampaignType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface CampaignRepository extends JpaRepository<Campaign, Long> {

    @Query("SELECT c FROM Campaign c WHERE c.restaurant.id = :restaurantId")
    Page<Campaign> findByRestaurantId(@Param("restaurantId") Long restaurantId, Pageable pageable);

    @Query("SELECT c FROM Campaign c WHERE c.restaurant.id = :restaurantId ORDER BY c.priority DESC, c.createdAt DESC")
    List<Campaign> findAllByRestaurantId(@Param("restaurantId") Long restaurantId);

    @Query("SELECT c FROM Campaign c WHERE c.restaurant.id = :restaurantId AND c.status = :status")
    List<Campaign> findByRestaurantIdAndStatus(@Param("restaurantId") Long restaurantId, @Param("status") CampaignStatus status);

    @Query("SELECT c FROM Campaign c WHERE c.restaurant.id = :restaurantId AND c.status = 'ACTIVE' " +
           "AND (c.validFrom IS NULL OR c.validFrom <= :now) " +
           "AND (c.validTo IS NULL OR c.validTo >= :now) " +
           "ORDER BY c.priority DESC")
    List<Campaign> findActiveCampaigns(@Param("restaurantId") Long restaurantId, @Param("now") LocalDateTime now);

    @Query("SELECT c FROM Campaign c WHERE c.restaurant.id = :restaurantId AND c.campaignType = :type")
    List<Campaign> findByRestaurantIdAndCampaignType(@Param("restaurantId") Long restaurantId, @Param("type") CampaignType type);
}
