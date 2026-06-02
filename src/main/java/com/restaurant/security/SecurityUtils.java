package com.restaurant.security;

import com.restaurant.forecast.InternalForecastAuthentication;
import com.restaurant.model.UserPermission;
import com.restaurant.tenant.TenantContext;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public class SecurityUtils {

    public static UserPrincipal getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof UserPrincipal) {
            return (UserPrincipal) authentication.getPrincipal();
        }
        return null;
    }
    
    public static Long getCurrentUserId() {
        UserPrincipal user = getCurrentUser();
        return user != null ? user.getId() : null;
    }
    
    public static com.restaurant.model.Role getCurrentUserRole() {
        UserPrincipal user = getCurrentUser();
        return user != null ? user.getRole() : null;
    }
    
    public static Long getCurrentRestaurantId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof InternalForecastAuthentication) {
            return ((InternalForecastAuthentication) auth).getPrincipal();
        }
        Long fromContext = TenantContext.getRestaurantId();
        if (fromContext != null) {
            return fromContext;
        }
        UserPrincipal user = getCurrentUser();
        return user != null ? user.getRestaurantId() : null;
    }

    /** Current tenant location id (new hierarchy). Prefer over restaurant id for new code. */
    public static Long getCurrentLocationId() {
        Long fromContext = TenantContext.getLocationId();
        if (fromContext != null) {
            return fromContext;
        }
        UserPrincipal user = getCurrentUser();
        return user != null ? user.getLocationId() : null;
    }
    
    public static boolean isHeadAdmin() {
        UserPrincipal user = getCurrentUser();
        return user != null && user.getRole() == com.restaurant.model.Role.HEAD_ADMIN;
    }
    
    public static boolean isAdmin() {
        UserPrincipal user = getCurrentUser();
        return user != null && user.getRole() == com.restaurant.model.Role.ADMIN;
    }
    
    public static boolean isRegularWorker() {
        UserPrincipal user = getCurrentUser();
        return user != null && user.getRole() == com.restaurant.model.Role.REGULAR_WORKER;
    }
    
    /**
     * Проверяет, есть ли у текущего пользователя указанное право.
     * Для ADMIN и HEAD_ADMIN всегда возвращает true (у них все права).
     * Для REGULAR_WORKER проверяет наличие права в списке permissions.
     */
    public static boolean hasPermission(UserPermission permission) {
        UserPrincipal user = getCurrentUser();
        if (user == null) {
            return false;
        }
        
        // ADMIN и HEAD_ADMIN имеют все права
        if (user.getRole() == com.restaurant.model.Role.ADMIN || 
            user.getRole() == com.restaurant.model.Role.HEAD_ADMIN) {
            return true;
        }
        
        // Для REGULAR_WORKER проверяем наличие права
        if (user.getRole() == com.restaurant.model.Role.REGULAR_WORKER) {
            return user.getPermissions() != null && user.getPermissions().contains(permission);
        }
        
        return false;
    }
}

