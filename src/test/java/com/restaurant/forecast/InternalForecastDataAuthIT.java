package com.restaurant.forecast;

import com.restaurant.controller.InternalForecastDataController;
import com.restaurant.dto.ForecastOrderRow;
import com.restaurant.service.ForecastDataService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies /api/internal/forecast-data/** is only accessible with InternalForecastAuthentication:
 * - No Authorization -> 401
 * - Normal user auth (existing in SecurityContext) + invalid internal JWT -> 403
 * - Valid internal JWT -> 200
 * Uses a minimal context (no main application, no DB/Redis) for fast, isolated tests.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.MOCK,
    classes = {
        InternalForecastDataController.class,
        InternalForecastDataAuthTestConfig.class,
        InternalForecastAuthFilter.class,
        InternalForecastJwtService.class,
    },
    properties = {
        // No DB: avoid pulling H2 + JPA from application-test.yml (this slice has no entities).
        "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,"
                + "org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
        "jwt.secret=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
        "qr.signing.secret=ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100",
        "forecast.internal_jwt.secret=YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkwYWJjZGVmZ2hpamts",
        "security.allow-insecure-dev-secrets=true"
    }
)
@EnableAutoConfiguration(exclude = SecurityAutoConfiguration.class)
@AutoConfigureMockMvc(addFilters = true)
class InternalForecastDataAuthIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private InternalForecastJwtService internalForecastJwtService;

    @MockBean
    private ForecastDataService forecastDataService;

    @Test
    void getOrdersWithoutAuthorization_returns401() throws Exception {
        mockMvc.perform(get("/api/internal/forecast-data/orders")
                .param("from", "2024-01-01")
                .param("to", "2024-01-31"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getOrdersWithNormalUserAuth_returns403() throws Exception {
        mockMvc.perform(get("/api/internal/forecast-data/orders")
                .param("from", "2024-01-01")
                .param("to", "2024-01-31")
                .header("Authorization", "Bearer not-internal-jwt")
                .header("X-Test-Normal-User", "true"))
                .andExpect(status().isForbidden());
    }

    @Test
    void getOrdersWithValidInternalJwt_returns200() throws Exception {
        when(forecastDataService.getOrdersData(any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(List.of(
                        new ForecastOrderRow(LocalDate.of(2024, 1, 15), BigDecimal.TEN, 2)
                ));
        String internalJwt = internalForecastJwtService.issue(1L);
        mockMvc.perform(get("/api/internal/forecast-data/orders")
                .param("from", "2024-01-01")
                .param("to", "2024-01-31")
                .header("Authorization", "Bearer " + internalJwt))
                .andExpect(status().isOk());
    }
}
