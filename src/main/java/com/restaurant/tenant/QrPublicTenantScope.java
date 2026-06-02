package com.restaurant.tenant;

import java.util.function.Supplier;

/**
 * QR / public ordering runs without {@link TenantFilter}. RLS still requires
 * {@code app.current_restaurant_id} for tenant tables — set legacy restaurant id for the request scope.
 */
public final class QrPublicTenantScope {

    private QrPublicTenantScope() {}

    public static <T> T run(Long restaurantId, Supplier<T> action) {
        if (restaurantId == null) {
            return action.get();
        }
        try {
            TenantContext.set(restaurantId);
            return action.get();
        } finally {
            TenantContext.clear();
        }
    }
}
