package com.restaurant.tenant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies that SET LOCAL app.current_restaurant_id is applied on the same
 * JDBC connection used by the transaction (via TenantAwareDataSource).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
class TenantConnectionBoundIT {

    @Container
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16")
            .withDatabaseName("restaurant_db")
            .withUsername("postgres")
            .withPassword("postgres");

    @DynamicPropertySource
    static void registerPg(DynamicPropertyRegistry registry) {
        String jdbcUrl = pg.getJdbcUrl();
        registry.add("spring.datasource.url", () -> jdbcUrl);
        registry.add("spring.datasource.username", pg::getUsername);
        registry.add("spring.datasource.password", pg::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("app.datasource.tenant.jdbc-url", () -> jdbcUrl);
        registry.add("app.datasource.tenant.username", pg::getUsername);
        registry.add("app.datasource.tenant.password", pg::getPassword);
        registry.add("app.datasource.tenant.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("app.datasource.platform.jdbc-url", () -> jdbcUrl);
        registry.add("app.datasource.platform.username", pg::getUsername);
        registry.add("app.datasource.platform.password", pg::getPassword);
        registry.add("app.datasource.platform.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.properties.hibernate.dialect", () -> "org.hibernate.dialect.PostgreSQLDialect");
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @Transactional
    void tenantSettingIsVisibleOnSameConnection() {
        TenantContext.set(123L);
        String v = jdbcTemplate.queryForObject(
                "SELECT current_setting('app.current_restaurant_id', true)",
                String.class);
        assertEquals("123", v);
    }
}
