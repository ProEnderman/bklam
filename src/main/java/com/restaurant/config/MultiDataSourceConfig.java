package com.restaurant.config;

import com.restaurant.tenant.TenantAwareDataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

/**
 * Tenant (primary, wrapped with TenantAwareDataSource) and platform DataSources.
 * JPA uses the wrapped tenant DataSource so SET LOCAL runs on the same connection.
 * Platform DataSource bypasses RLS (app_platform role); use platformJdbcTemplate for cross-tenant reads.
 */
@Configuration
public class MultiDataSourceConfig {

    @Bean(name = "rawTenantDataSource")
    @ConfigurationProperties(prefix = "app.datasource.tenant")
    public DataSource rawTenantDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Primary
    @Bean(name = "tenantDataSource")
    public DataSource tenantDataSource(@Qualifier("rawTenantDataSource") DataSource raw) {
        return new TenantAwareDataSource(raw);
    }

    @Bean(name = "platformDataSource")
    @ConfigurationProperties(prefix = "app.datasource.platform")
    public DataSource platformDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    public JdbcTemplate platformJdbcTemplate(@Qualifier("platformDataSource") DataSource platformDataSource) {
        return new JdbcTemplate(platformDataSource);
    }

    @Primary
    @Bean
    public JdbcTemplate jdbcTemplate(@Qualifier("tenantDataSource") DataSource tenantDataSource) {
        return new JdbcTemplate(tenantDataSource);
    }
}
