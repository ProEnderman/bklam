package com.restaurant.tenant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies V73 migration: holdings, locations from restaurants, users.location_id backfill.
 * Requires Docker for Testcontainers.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
@TestPropertySource(properties = {
    "spring.flyway.enabled=true",
    "spring.jpa.hibernate.ddl-auto=none"
})
class NetworkHierarchyMigrationIT {

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
    void migrationCreatesHoldingsAndLocations() {
        Long holdingCount = jdbcTemplate.queryForObject("SELECT count(*) FROM holdings", Long.class);
        assertThat(holdingCount).isGreaterThanOrEqualTo(1L);

        Long restaurantCount = jdbcTemplate.queryForObject("SELECT count(*) FROM restaurants", Long.class);
        Long locationCount = jdbcTemplate.queryForObject("SELECT count(*) FROM locations", Long.class);
        assertThat(locationCount).isEqualTo(restaurantCount);
    }

    @Test
    void usersWithRestaurantHaveLocationIdBackfilled() {
        Long usersWithRestaurant = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM users WHERE restaurant_id IS NOT NULL", Long.class);
        Long usersWithLocationId = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM users WHERE location_id IS NOT NULL", Long.class);
        assertThat(usersWithLocationId).as("Every user with restaurant_id should have location_id after backfill")
                .isEqualTo(usersWithRestaurant);
    }
}
