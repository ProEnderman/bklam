package com.restaurant.config;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Optional;

/**
 * DB-backed distributed locks for {@code @Scheduled} jobs so only one instance runs
 * each job when multiple backends share the same database.
 * <p>
 * Uses the platform {@link JdbcTemplate} (same physical DB as migrations; bypasses tenant RLS wrapper).
 * Profile {@code test} uses a no-op {@link LockProvider} so tests do not require Flyway or {@code shedlock} table.
 */
@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "10m")
public class ShedLockConfig {

    @Bean
    @Profile("!test")
    public LockProvider shedLockProvider(@Qualifier("platformJdbcTemplate") JdbcTemplate platformJdbcTemplate) {
        return new JdbcTemplateLockProvider(
                JdbcTemplateLockProvider.Configuration.builder()
                        .withJdbcTemplate(platformJdbcTemplate)
                        .usingDbTime()
                        .build());
    }

    @Bean
    @Profile("test")
    public LockProvider testShedLockProvider() {
        return lockConfiguration -> Optional.of(new SimpleLock() {
            @Override
            public void unlock() {
                // no-op: single test JVM; no cross-process contention
            }
        });
    }
}
