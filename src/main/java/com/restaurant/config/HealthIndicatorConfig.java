package com.restaurant.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * Short-timeout {@link RestTemplate} for actuator dependency pings only (not for business HTTP).
 */
@Configuration
public class HealthIndicatorConfig {

    @Bean
    @Qualifier("healthCheckRestTemplate")
    public RestTemplate healthCheckRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(3000);
        return new RestTemplate(factory);
    }
}
