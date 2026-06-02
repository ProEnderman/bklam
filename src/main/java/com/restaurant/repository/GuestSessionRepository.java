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

    /**
     * Resolves guest session for public QR API when {@code app.current_restaurant_id} is not set
     * (see {@code lookup_guest_session} in Flyway V97).
     */
    @Query(value = "SELECT * FROM lookup_guest_session(CAST(:token AS text))", nativeQuery = true)
    Optional<GuestSession> findByLookupToken(@Param("token") String token);

    void deleteByExpiresAtBefore(LocalDateTime now);
}
