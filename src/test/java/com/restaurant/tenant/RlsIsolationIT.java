package com.restaurant.tenant;

import com.restaurant.model.Ingredient;
import com.restaurant.model.Restaurant;
import com.restaurant.model.Unit;
import com.restaurant.repository.IngredientRepository;
import com.restaurant.repository.RestaurantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves that RLS blocks cross-tenant reads even when the repository does not filter by restaurant_id.
 * Uses a non-superuser DB role (rls_it): PostgreSQL superusers bypass RLS.
 * After Flyway, FORCE ROW LEVEL SECURITY so policies apply to the table owner too.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
@TestPropertySource(properties = {
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=none"
})
class RlsIsolationIT {

    private static final AtomicBoolean RLS_FORCE_APPLIED = new AtomicBoolean(false);
    /** After Flyway runs as postgres, tables are owned by postgres — grant DML to rls_it for the test role. */
    private static final AtomicBoolean RLS_IT_TABLE_GRANTS = new AtomicBoolean(false);

    @Container
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16")
            .withDatabaseName("restaurant_db")
            .withUsername("postgres")
            .withPassword("postgres")
            .withInitScript("testcontainers/rls-it-init.sql");

    @DynamicPropertySource
    static void datasourceProps(DynamicPropertyRegistry registry) {
        String jdbcUrl = pg.getJdbcUrl();
        registry.add("app.datasource.tenant.jdbc-url", () -> jdbcUrl);
        registry.add("app.datasource.tenant.username", () -> "rls_it");
        registry.add("app.datasource.tenant.password", () -> "postgres");
        registry.add("app.datasource.tenant.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("app.datasource.platform.jdbc-url", () -> jdbcUrl);
        registry.add("app.datasource.platform.username", () -> "rls_it");
        registry.add("app.datasource.platform.password", () -> "postgres");
        registry.add("app.datasource.platform.driver-class-name", () -> "org.postgresql.Driver");
        // Flyway must run as a role that can bypass RLS for data-fix migrations (e.g. V73 UPDATE users).
        // Provide an explicit JDBC URL so Boot builds a dedicated migration DataSource (SimpleDriverDataSource),
        // instead of deriving from the tenant Hikari pool (jdbc-url + username override can fail validation).
        registry.add("spring.flyway.url", () -> jdbcUrl);
        registry.add("spring.flyway.user", () -> "postgres");
        registry.add("spring.flyway.password", () -> "postgres");
        registry.add("spring.jpa.properties.hibernate.dialect", () -> "org.hibernate.dialect.PostgreSQLDialect");
    }

    @Autowired
    private IngredientRepository ingredientRepository;
    @Autowired
    private RestaurantRepository restaurantRepository;
    @Autowired
    private TransactionTemplate transactionTemplate;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Long restaurant1Id;
    private Long restaurant2Id;
    private Long ingredient1Id;
    private Long ingredient2Id;

    @BeforeEach
    void insertTestData() throws Exception {
        if (RLS_FORCE_APPLIED.compareAndSet(false, true)) {
            try (Connection c = DriverManager.getConnection(pg.getJdbcUrl(), "postgres", "postgres");
                 Statement st = c.createStatement()) {
                st.execute("ALTER TABLE IF EXISTS ingredients FORCE ROW LEVEL SECURITY");
            }
        }
        if (RLS_IT_TABLE_GRANTS.compareAndSet(false, true)) {
            try (Connection c = DriverManager.getConnection(pg.getJdbcUrl(), "postgres", "postgres");
                 Statement st = c.createStatement()) {
                st.execute("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO rls_it");
                st.execute("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO rls_it");
            }
        }

        transactionTemplate.executeWithoutResult(status -> {
            Restaurant r1 = new Restaurant();
            r1.setName("Restaurant One");
            r1 = restaurantRepository.save(r1);
            restaurant1Id = r1.getId();

            Restaurant r2 = new Restaurant();
            r2.setName("Restaurant Two");
            r2 = restaurantRepository.save(r2);
            restaurant2Id = r2.getId();
        });

        transactionTemplate.executeWithoutResult(status -> {
            TenantContext.set(restaurant1Id);
            jdbcTemplate.execute(
                    "SELECT set_config('app.current_restaurant_id', '" + restaurant1Id + "', true)");
            Restaurant r1 = restaurantRepository.findById(restaurant1Id).orElseThrow();
            Ingredient i1 = new Ingredient();
            i1.setName("Salt");
            i1.setUnit(Unit.G);
            i1.setStockQty(10.0);
            i1.setMinQty(1.0);
            i1.setRestaurant(r1);
            i1 = ingredientRepository.save(i1);
            ingredient1Id = i1.getId();
        });

        transactionTemplate.executeWithoutResult(status -> {
            TenantContext.set(restaurant2Id);
            jdbcTemplate.execute(
                    "SELECT set_config('app.current_restaurant_id', '" + restaurant2Id + "', true)");
            Restaurant r2 = restaurantRepository.findById(restaurant2Id).orElseThrow();
            Ingredient i2 = new Ingredient();
            i2.setName("Salt");
            i2.setUnit(Unit.G);
            i2.setStockQty(5.0);
            i2.setMinQty(1.0);
            i2.setRestaurant(r2);
            i2 = ingredientRepository.save(i2);
            ingredient2Id = i2.getId();
        });

        TenantContext.clear();
    }

    @Test
    @Transactional
    void rlsBlocksCrossTenantReadEvenIfRepoForgetsFilter() {
        TenantContext.set(restaurant1Id);
        jdbcTemplate.execute(
                "SELECT set_config('app.current_restaurant_id', '" + restaurant1Id + "', true)");

        Long visible = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM ingredients WHERE id = ?",
                Long.class,
                ingredient2Id);
        assertThat(visible).isZero();
    }

    @Test
    @Transactional
    void rlsAllowsSameTenantRead() {
        TenantContext.set(restaurant1Id);
        jdbcTemplate.execute(
                "SELECT set_config('app.current_restaurant_id', '" + restaurant1Id + "', true)");

        Long visible = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM ingredients WHERE id = ?",
                Long.class,
                ingredient1Id);
        assertThat(visible).isEqualTo(1L);
    }
}
