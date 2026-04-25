package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.GuestAlias;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GuestAliasRepository extends JpaRepository<GuestAlias, Long> {

    Optional<GuestAlias> findByAliasPhone(String aliasPhone);

    @Query("SELECT ga FROM GuestAlias ga WHERE ga.primaryGuest.id = :primaryGuestId")
    List<GuestAlias> findByPrimaryGuestId(@Param("primaryGuestId") Long primaryGuestId);
}
