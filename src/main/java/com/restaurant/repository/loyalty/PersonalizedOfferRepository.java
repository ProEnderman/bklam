package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.OfferStatus;
import com.restaurant.model.loyalty.PersonalizedOffer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PersonalizedOfferRepository extends JpaRepository<PersonalizedOffer, Long> {

    @Query("SELECT po FROM PersonalizedOffer po WHERE po.guest.id = :guestId")
    Page<PersonalizedOffer> findByGuestId(@Param("guestId") Long guestId, Pageable pageable);

    @Query("SELECT po FROM PersonalizedOffer po WHERE po.guest.id = :guestId AND po.status = :status")
    List<PersonalizedOffer> findByGuestIdAndStatus(@Param("guestId") Long guestId, @Param("status") OfferStatus status);
}
