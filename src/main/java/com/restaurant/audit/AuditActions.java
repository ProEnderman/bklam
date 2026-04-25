package com.restaurant.audit;

/**
 * Stable action names for structured audit logs (log aggregation / SIEM).
 */
public final class AuditActions {

    private AuditActions() {}

    public static final String ORDER_CREATED = "ORDER_CREATED";
    public static final String ORDER_UPDATED = "ORDER_UPDATED";

    public static final String LOYALTY_POINTS_EARNED = "LOYALTY_POINTS_EARNED";
    public static final String LOYALTY_POINTS_BURNED = "LOYALTY_POINTS_BURNED";
    public static final String LOYALTY_BURN_DENIED = "LOYALTY_BURN_DENIED";

    public static final String LOGIN_SUCCESS = "LOGIN_SUCCESS";
    public static final String AUTH_CREDENTIALS_FAILURE = "AUTH_CREDENTIALS_FAILURE";
    public static final String TOKEN_REFRESH_SUCCESS = "TOKEN_REFRESH_SUCCESS";
    public static final String TOKEN_REFRESH_FAILURE = "TOKEN_REFRESH_FAILURE";

    public static final String PLATFORM_RESTAURANT_CREATED = "PLATFORM_RESTAURANT_CREATED";
    public static final String PLATFORM_ADMIN_CREATED = "PLATFORM_ADMIN_CREATED";
    public static final String PLATFORM_USER_ROLE_CHANGED = "PLATFORM_USER_ROLE_CHANGED";
}
