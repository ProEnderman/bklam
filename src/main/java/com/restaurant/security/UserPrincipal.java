package com.restaurant.security;

import com.restaurant.model.Role;
import com.restaurant.model.User;
import com.restaurant.model.UserPermission;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.Collections;
import java.util.List;

@Getter
@AllArgsConstructor
public class UserPrincipal implements UserDetails {
    
    private Long id;
    private String username;
    private String password;
    private Role role;
    private Long restaurantId;
    private Long locationId;
    private boolean active;
    private List<UserPermission> permissions;

    public static UserPrincipal create(User user) {
        return new UserPrincipal(
            user.getId(),
            user.getUsername(),
            user.getPasswordHash(),
            user.getRole(),
            user.getRestaurantId(),
            user.getLocationId(),
            user.getIsActive(),
            user.getPermissions() != null ? user.getPermissions() : Collections.emptyList()
        );
    }
    
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }
    
    @Override
    public String getPassword() {
        return password;
    }
    
    @Override
    public String getUsername() {
        return username;
    }
    
    public String getEmail() {
        // Для обратной совместимости, но теперь это username
        return username;
    }
    
    @Override
    public boolean isAccountNonExpired() {
        return true;
    }
    
    @Override
    public boolean isAccountNonLocked() {
        return true;
    }
    
    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }
    
    @Override
    public boolean isEnabled() {
        return active;
    }
}

