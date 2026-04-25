package com.restaurant.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "verification_codes")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class VerificationCode {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    
    @Column(name = "challenge_id", unique = true)
    private String challengeId; // UUID для предотвращения повторных запросов
    
    @Column(name = "code_hash", nullable = false)
    private String codeHash; // Хеш кода (bcrypt), НЕ сам код
    
    @Column(nullable = false)
    private String email;
    
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
    
    @Column(nullable = false)
    private Boolean used = false;
    
    @Column(name = "attempts_left", nullable = false)
    private Integer attemptsLeft = 5;
    
    @Column(name = "last_sent_at")
    private LocalDateTime lastSentAt;
    
    @Column(name = "send_count", nullable = false)
    private Integer sendCount = 1;
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (lastSentAt == null) {
            lastSentAt = LocalDateTime.now();
        }
    }
    
    public boolean isExpired() {
        return LocalDateTime.now().isAfter(expiresAt);
    }
    
    public boolean isValid() {
        return !used && !isExpired() && attemptsLeft > 0;
    }
    
    public void decrementAttempts() {
        if (attemptsLeft > 0) {
            attemptsLeft--;
        }
    }
}

