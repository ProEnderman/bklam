package com.restaurant.tenant;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TenantContextTest {

    @AfterEach
    void clear() {
        TenantContext.clear();
    }

    @Test
    void setAndGetRestaurantId() {
        TenantContext.set(100L);
        assertThat(TenantContext.getRestaurantId()).isEqualTo(100L);
        assertThat(TenantContext.get()).isEqualTo(100L);
        assertThat(TenantContext.getLocationId()).isNull();
    }

    @Test
    void setLocationAndRestaurant() {
        TenantContext.setLocationAndRestaurant(5L, 10L);
        assertThat(TenantContext.getLocationId()).isEqualTo(5L);
        assertThat(TenantContext.getRestaurantId()).isEqualTo(10L);
        assertThat(TenantContext.get()).isEqualTo(5L);
    }

    @Test
    void getPrefersLocationId() {
        TenantContext.setLocationAndRestaurant(3L, 7L);
        assertThat(TenantContext.get()).isEqualTo(3L);
    }

    @Test
    void requireLocationIdThrowsWhenNull() {
        TenantContext.set(1L);
        assertThatThrownBy(TenantContext::requireLocationId)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("location id");
    }

    @Test
    void requireLocationIdReturnsWhenSet() {
        TenantContext.setLocationAndRestaurant(2L, 4L);
        assertThat(TenantContext.requireLocationId()).isEqualTo(2L);
    }

    @Test
    void clearRemovesAll() {
        TenantContext.setLocationAndRestaurant(1L, 2L);
        TenantContext.clear();
        assertThat(TenantContext.getLocationId()).isNull();
        assertThat(TenantContext.getRestaurantId()).isNull();
        assertThat(TenantContext.get()).isNull();
    }
}
