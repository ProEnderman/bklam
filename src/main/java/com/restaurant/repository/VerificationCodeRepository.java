package com.restaurant.repository;

import com.restaurant.model.VerificationCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface VerificationCodeRepository extends JpaRepository<VerificationCode, Long> {
    
    Optional<VerificationCode> findByChallengeIdAndUsedFalse(String challengeId);
    
    Optional<VerificationCode> findByChallengeId(String challengeId);
    
    Optional<VerificationCode> findByUserIdAndChallengeIdAndUsedFalse(Long userId, String challengeId);
    
    @Modifying
    @Query("DELETE FROM VerificationCode v WHERE v.expiresAt < :now")
    void deleteExpiredCodes(LocalDateTime now);
    
    @Modifying
    @Query("UPDATE VerificationCode v SET v.used = true WHERE v.user.id = :userId AND v.used = false")
    void markAllUserCodesAsUsed(Long userId);
    
    // Проверка последней отправки для анти-спама
    @Query("SELECT COUNT(v) FROM VerificationCode v WHERE v.user.id = :userId AND v.lastSentAt > :since")
    long countRecentCodes(Long userId, LocalDateTime since);
}

