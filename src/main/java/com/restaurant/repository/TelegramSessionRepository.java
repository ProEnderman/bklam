package com.restaurant.repository;

import com.restaurant.model.TelegramSession;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TelegramSessionRepository extends JpaRepository<TelegramSession, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM TelegramSession t WHERE t.id = :id")
    Optional<TelegramSession> findByIdForUpdate(@Param("id") Long id);

    Optional<TelegramSession> findByTelegramUserId(Long telegramUserId);
}
