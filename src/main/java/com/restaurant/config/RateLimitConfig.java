package com.restaurant.config;

import com.restaurant.repository.GuestSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataAccessException;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.time.LocalDateTime;

@Configuration
public class RateLimitConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(RateLimitConfig.class);

    @Autowired
    private RateLimitInterceptor rateLimitInterceptor;

    @Autowired
    private GuestSessionRepository guestSessionRepository;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(rateLimitInterceptor);
    }

    /**
     * Evict idle Bucket4j map entries in {@link RateLimitInterceptor} (per-instance memory bound).
     */
    @Scheduled(fixedRate = 120_000)
    public void evictStaleEntries() {
        rateLimitInterceptor.evict();
    }

    @Scheduled(cron = "0 0 * * * ?")
    @SchedulerLock(name = "RateLimit.cleanupGuestSessions", lockAtLeastFor = "50s", lockAtMostFor = "55m")
    @Transactional
    public void cleanupExpiredGuestSessions() {
        try {
            guestSessionRepository.deleteByExpiresAtBefore(LocalDateTime.now());
        } catch (DataAccessException e) {
            log.debug("Guest session cleanup skipped (schema may not be ready): {}", e.getMessage());
        }
    }
}
