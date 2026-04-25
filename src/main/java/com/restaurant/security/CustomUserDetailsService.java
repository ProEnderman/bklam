package com.restaurant.security;

import com.restaurant.model.User;
import com.restaurant.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {
    
    private final UserRepository userRepository;
    
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        log.debug("Loading user by username: {}", username);
        User user = userRepository.findByUsernameWithLocation(username)
            .orElseThrow(() -> {
                log.error("User not found with username: {}", username);
                return new UsernameNotFoundException("User not found with username: " + username);
            });
        
        log.debug("User found: ID={}, username={}, role={}, active={}", 
            user.getId(), user.getUsername(), user.getRole(), user.getIsActive());
        
        return UserPrincipal.create(user);
    }
}

