package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.BonusAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface BonusAccountRepository extends JpaRepository<BonusAccount, Long> {

    @Query("SELECT ba FROM BonusAccount ba WHERE ba.guest.id = :guestId")
    Optional<BonusAccount> findByGuestId(@Param("guestId") Long guestId);
}
