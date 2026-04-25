package com.restaurant.tenant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Verifies RLS blocks cross-tenant INSERT (WITH CHECK policy).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
@TestPropertySource(properties = {
    "spring.flyway.enabled=true",
    "spring.jpa.hibernate.ddl-auto=none"
})
class RlsInsertIsolationIT {

    @Container
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16")
            .withDatabaseName("restaurant_db")
            .withUsername("postgres")
            .withPassword("postgres");

    @DynamicPropertySource
    static void datasourceProps(DynamicPropertyRegistry registry) {
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
    void rlsBlocksCrossTenantInsert() {
        TenantContext.set(1L);
        assertThatThrownBy(() ->
                jdbcTemplate.update("INSERT INTO ingredients (restaurant_id, name, unit, stock_qty, min_qty) VALUES (?, ?, 'G', 1.0, 0.0)", 2L, "X"))
                .isNotNull();
    }
}
