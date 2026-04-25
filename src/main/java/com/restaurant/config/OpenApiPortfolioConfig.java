package com.restaurant.config;

import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Curated OpenAPI group for a review-friendly subset of the monolith.
 * The default group still exposes the full API in Swagger UI.
 */
@Configuration
public class OpenApiPortfolioConfig {

    @Bean
    public GroupedOpenApi portfolioOpenApi() {
        return GroupedOpenApi.builder()
                .group("portfolio")
                .displayName("Portfolio (demo / review subset)")
                .pathsToMatch(
                        "/api/platform/**",
                        "/api/auth/**",
                        "/api/orders/**",
                        "/api/ingredients/**",
                        "/api/dishes/**"
                )
                .build();
    }
}
