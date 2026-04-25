package com.restaurant.config;

import com.restaurant.model.Role;
import com.restaurant.model.User;
import com.restaurant.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates or updates a HEAD_ADMIN from environment variables. Never enabled in production profile.
 * Use for a real mailbox and password you keep in {@code .env} (not committed).
 */
@Component
@Profile("!prod")
@Order(Ordered.LOWEST_PRECEDENCE)
public class PersonalHeadAdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PersonalHeadAdminSeeder.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final boolean enabled;
    private final String email;
    private final String password;

    public PersonalHeadAdminSeeder(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            @Value("${SEED_PERSONAL_HEAD_ADMIN_ENABLED:false}") boolean enabled,
            @Value("${SEED_PERSONAL_HEAD_ADMIN_EMAIL:}") String email,
            @Value("${SEED_PERSONAL_HEAD_ADMIN_PASSWORD:}") String password) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.enabled = enabled;
        this.email = email;
        this.password = password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!enabled) {
            return;
        }
        if (email == null || email.isBlank()) {
            log.warn("SEED_PERSONAL_HEAD_ADMIN_ENABLED is true but SEED_PERSONAL_HEAD_ADMIN_EMAIL is empty; skip seeding.");
            return;
        }
        if (password == null || password.isEmpty()) {
            log.warn("SEED_PERSONAL_HEAD_ADMIN_ENABLED is true but SEED_PERSONAL_HEAD_ADMIN_PASSWORD is empty; skip seeding.");
            return;
        }
        var normalized = email.trim();
        var existing = userRepository.findByUsername(normalized);
        if (existing.isEmpty()) {
            var u = new User();
            u.setUsername(normalized);
            u.setPasswordHash(passwordEncoder.encode(password));
            u.setRole(Role.HEAD_ADMIN);
            u.setFirstName("Head");
            u.setLastName("Admin");
            u.setIsActive(true);
            userRepository.save(u);
            log.info("Seeded personal HEAD_ADMIN user (new row).");
        } else {
            var u = existing.get();
            u.setPasswordHash(passwordEncoder.encode(password));
            u.setRole(Role.HEAD_ADMIN);
            u.setIsActive(true);
            userRepository.save(u);
            log.info("Seeded personal HEAD_ADMIN user (updated existing).");
        }
    }
}
