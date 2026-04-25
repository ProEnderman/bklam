package com.restaurant.tenant;

/**
 * Thread-local tenant context for multi-tenancy isolation.
 * Primary key is {@link #getLocationId()}; {@link #getRestaurantId()} is kept for RLS and backward compatibility.
 * Populated once per request from the authenticated principal; cleared after request.
 */
public final class TenantContext {

    private static final ThreadLocal<Long> LOCATION_ID = new ThreadLocal<>();
    /** Legacy restaurant id; used for RLS (app.current_restaurant_id) and backward compatibility. */
    private static final ThreadLocal<Long> RESTAURANT_ID = new ThreadLocal<>();

    private TenantContext() {}

    /** Sets both location and legacy restaurant id (e.g. from filter when both are known). */
    public static void setLocationAndRestaurant(Long locationId, Long restaurantId) {
        LOCATION_ID.set(locationId);
        RESTAURANT_ID.set(restaurantId);
    }

    /** Sets tenant by legacy restaurant id only (backward compat). RLS and getRestaurantId() will use it; getLocationId() may be null until resolved. */
    public static void set(Long restaurantId) {
        RESTAURANT_ID.set(restaurantId);
        LOCATION_ID.set(null);
    }

    /** Sets location as primary tenant; restaurant id is for RLS and must be set separately or via setLocationAndRestaurant. */
    public static void setLocationId(Long locationId) {
        LOCATION_ID.set(locationId);
    }

    /** Primary tenant key. Use this for new code. */
    public static Long getLocationId() {
        return LOCATION_ID.get();
    }

    /**
     * Legacy restaurant id. Used by RLS (app.current_restaurant_id) and existing code.
     * @deprecated Prefer {@link #getLocationId()} and {@link #requireLocationId()}; kept for transition.
     */
    @Deprecated
    public static Long getRestaurantId() {
        return RESTAURANT_ID.get();
    }

    /** Returns legacy tenant id: location id if set, else restaurant id. For backward compat where a single "tenant id" is used. */
    public static Long get() {
        Long loc = LOCATION_ID.get();
        if (loc != null) return loc;
        return RESTAURANT_ID.get();
    }

    public static Long requireLocationId() {
        Long id = LOCATION_ID.get();
        if (id == null) {
            throw new IllegalStateException("Tenant context has no location id");
        }
        return id;
    }

    public static void clear() {
        LOCATION_ID.remove();
        RESTAURANT_ID.remove();
    }
}
