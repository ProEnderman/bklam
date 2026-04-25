package com.restaurant.service;

import com.restaurant.exception.BusinessException;
import com.restaurant.model.User;
import com.restaurant.model.VerificationCode;
import com.restaurant.repository.VerificationCodeRepository;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Random;
import java.util.UUID;

@Slf4j
@Service
public class VerificationCodeService {

    private final JdbcTemplate platformJdbcTemplate;
    private final VerificationCodeRepository verificationCodeRepository;
    private final EmailService emailService;
    private final PasswordEncoder passwordEncoder;

    public VerificationCodeService(
            @Qualifier("platformJdbcTemplate") JdbcTemplate platformJdbcTemplate,
            VerificationCodeRepository verificationCodeRepository,
            EmailService emailService,
            PasswordEncoder passwordEncoder) {
        this.platformJdbcTemplate = platformJdbcTemplate;
        this.verificationCodeRepository = verificationCodeRepository;
        this.emailService = emailService;
        this.passwordEncoder = passwordEncoder;
    }
    private final Random random = new Random();
    
    private static final int CODE_LENGTH = 6;
    private static final int CODE_EXPIRATION_MINUTES = 10;
    private static final int MIN_SEND_INTERVAL_MINUTES = 1; // Анти-спам: минимум 1 минута между отправками
    
    @Transactional
    public String generateAndSendCode(User user) {
        // Анти-спам: проверяем последнюю отправку
        LocalDateTime oneMinuteAgo = LocalDateTime.now().minusMinutes(MIN_SEND_INTERVAL_MINUTES);
        long recentCodes = verificationCodeRepository.countRecentCodes(user.getId(), oneMinuteAgo);
        if (recentCodes > 0) {
            throw new BusinessException("Please wait before requesting a new code");
        }
        
        // Помечаем все предыдущие коды как использованные
        verificationCodeRepository.markAllUserCodesAsUsed(user.getId());
        
        // Генерируем уникальный challenge_id
        String challengeId = UUID.randomUUID().toString();
        
        // Генерируем новый код
        String code = generateCode();
        
        // Хешируем код (bcrypt)
        String codeHash = passwordEncoder.encode(code);
        
        // Создаем запись в базе
        VerificationCode verificationCode = new VerificationCode();
        verificationCode.setUser(user);
        verificationCode.setChallengeId(challengeId);
        verificationCode.setCodeHash(codeHash);
        verificationCode.setEmail(user.getUsername()); // username хранится как email
        verificationCode.setExpiresAt(LocalDateTime.now().plusMinutes(CODE_EXPIRATION_MINUTES));
        verificationCode.setUsed(false);
        verificationCode.setAttemptsLeft(5);
        verificationCode.setLastSentAt(LocalDateTime.now());
        verificationCode.setSendCount(1);
        
        verificationCodeRepository.save(verificationCode);
        
        // Отправляем email с кодом
        emailService.sendVerificationCode(user.getUsername(), code);
        
        log.info("Verification code generated for user: {}, challengeId: {}", user.getUsername(), challengeId);
        
        return challengeId;
    }
    
    @Transactional
    public boolean verifyCode(String challengeId, String code) {
        VerificationCode verificationCode = verificationCodeRepository
            .findByChallengeIdAndUsedFalse(challengeId)
            .orElse(null);
        
        if (verificationCode == null) {
            log.warn("Verification code not found or already used for challengeId: {}", challengeId);
            throw new BusinessException("Verification code not found or already used");
        }
        
        if (verificationCode.isExpired()) {
            log.warn("Verification code expired for challengeId: {}", challengeId);
            throw new BusinessException("Verification code expired. Please request a new one");
        }
        
        if (verificationCode.getAttemptsLeft() <= 0) {
            log.warn("No attempts left for challengeId: {}", challengeId);
            throw new BusinessException("Too many attempts. Please request a new code");
        }
        
        // Проверяем код через сравнение хешей
        if (!passwordEncoder.matches(code, verificationCode.getCodeHash())) {
            // Уменьшаем количество попыток
            verificationCode.decrementAttempts();
            verificationCodeRepository.save(verificationCode);
            log.warn("Invalid code for challengeId: {}, attempts left: {}", challengeId, verificationCode.getAttemptsLeft());
            throw new BusinessException("Invalid verification code. Attempts left: " + verificationCode.getAttemptsLeft());
        }
        
        // Код верный - помечаем как использованный
        verificationCode.setUsed(true);
        verificationCodeRepository.save(verificationCode);
        
        log.info("Verification code verified successfully for challengeId: {}", challengeId);
        return true;
    }
    
    private String generateCode() {
        return String.format("%06d", random.nextInt(1000000));
    }
    
    /**
     * Runs on scheduler thread (no request); uses platform DS to delete expired codes across all tenants.
     * {@code verification_codes} is global; predicate is only {@code expires_at} (no cross-tenant row leakage of secrets).
     */
    @Scheduled(fixedRate = 3600000) // Каждый час
    @SchedulerLock(name = "VerificationCode.cleanupExpired", lockAtLeastFor = "10s", lockAtMostFor = "50m")
    public void cleanupExpiredCodes() {
        try {
            int deleted = platformJdbcTemplate.update("DELETE FROM verification_codes WHERE expires_at < ?", LocalDateTime.now());
            if (deleted > 0) {
                log.debug("Expired verification codes cleaned up: {} rows", deleted);
            }
        } catch (BadSqlGrammarException e) {
            if (e.getCause() != null && e.getCause().getMessage() != null && e.getCause().getMessage().contains("does not exist")) {
                log.trace("Skipping verification_codes cleanup: table not present (incomplete schema)");
                return;
            }
            throw e;
        }
    }
}

