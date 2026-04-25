package com.restaurant.repository;

import com.restaurant.model.GuestSession;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface GuestSessionRepository extends JpaRepository<GuestSession, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT g FROM GuestSession g WHERE g.id = :id")
    Optional<GuestSession> findByIdForUpdate(@Param("id") Long id);

    Optional<GuestSession> findBySessionTokenAndExpiresAtAfter(String sessionToken, LocalDateTime now);

    void deleteByExpiresAtBefore(LocalDateTime now);
}
