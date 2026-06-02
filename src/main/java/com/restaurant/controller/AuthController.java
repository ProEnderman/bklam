package com.restaurant.controller;

import com.restaurant.dto.AuthResponse;
import com.restaurant.dto.LoginRequest;
import com.restaurant.dto.LoginWithCodeRequest;
import com.restaurant.dto.RequestCodeResponse;
import com.restaurant.dto.VerifyCodeWithChallengeRequest;
import com.restaurant.exception.BusinessException;
import com.restaurant.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@Tag(name = "Authentication", description = "Авторизация и аутентификация")
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    
    private final AuthService authService;
    
    @Operation(summary = "Запрос кода подтверждения", description = "Отправляет код подтверждения на email после проверки пароля. Возвращает challengeId для последующей верификации.")
    @PostMapping("/login/request-code")
    public ResponseEntity<RequestCodeResponse> requestVerificationCode(
        @Valid @RequestBody LoginRequest request,
        HttpServletRequest httpRequest
    ) {
        String challengeId = authService.requestVerificationCode(request, httpRequest);
        return ResponseEntity.ok(new RequestCodeResponse(
            challengeId,
            "Verification code sent to your email"
        ));
    }
    
    @Operation(summary = "Вход в систему с кодом подтверждения (новый подход)", description = "Авторизация пользователя по challengeId и коду подтверждения (БЕЗ повторной передачи пароля)")
    @PostMapping("/login/verify")
    public ResponseEntity<AuthResponse> verifyCodeAndLogin(
        @Valid @RequestBody VerifyCodeWithChallengeRequest request,
        HttpServletRequest httpRequest,
        HttpServletResponse response
    ) {
        AuthResponse authResponse = authService.verifyCodeAndLogin(
            request.challengeId(),
            request.code(),
            response,
            httpRequest
        );
        return ResponseEntity.ok(authResponse);
    }
    
    @Operation(summary = "Вход в систему с кодом подтверждения (старый подход, deprecated)", description = "Авторизация пользователя по email, паролю и коду подтверждения. Используется для обратной совместимости.")
    @PostMapping("/login/verify-legacy")
    @Deprecated
    public ResponseEntity<AuthResponse> verifyCodeAndLoginLegacy(
        @Valid @RequestBody LoginWithCodeRequest request,
        HttpServletResponse response
    ) {
        AuthResponse authResponse = authService.verifyCodeAndLogin(
            request.login(), 
            request.verification(), 
            response
        );
        return ResponseEntity.ok(authResponse);
    }
    
    @Operation(summary = "Выход из системы", description = "Выход пользователя и инвалидация токенов")
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        String refreshToken = getRefreshTokenFromCookie(request);
        authService.logout(refreshToken, response);
        return ResponseEntity.ok().build();
    }
    
    @Operation(summary = "Обновление токена", description = "Обновление access token с помощью refresh token")
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        log.info("Refresh token request received");
        String refreshToken = getRefreshTokenFromCookie(request);
        if (refreshToken == null || refreshToken.isEmpty()) {
            log.warn("Refresh token cookie is missing or empty in request");
            return ResponseEntity.status(401).build();
        }
        
        try {
        AuthResponse authResponse = authService.refresh(refreshToken, response);
            log.info("Refresh token successful");
        return ResponseEntity.ok(authResponse);
        } catch (BusinessException e) {
            log.error("Refresh token failed: {}", e.getMessage());
            // Если refresh token невалиден или истек
            // Удаляем cookies при ошибке (удаляем со всеми возможными путями)
            String[] paths = {"/", "/api/auth/refresh", "/api"};
            for (String path : paths) {
            Cookie deleteCookie = new Cookie("refresh_token", "");
                deleteCookie.setPath(path);
            deleteCookie.setMaxAge(0);
            response.addCookie(deleteCookie);
            
            Cookie deleteAccessCookie = new Cookie("access_token", "");
                deleteAccessCookie.setPath(path);
            deleteAccessCookie.setMaxAge(0);
            response.addCookie(deleteAccessCookie);
            }
            
            return ResponseEntity.status(401).build();
        }
    }
    
    @Operation(summary = "Текущий пользователь", description = "Получение информации о текущем авторизованном пользователе")
    @GetMapping("/me")
    public ResponseEntity<AuthResponse> getCurrentUser() {
        try {
        AuthResponse authResponse = authService.getCurrentUser();
        return ResponseEntity.ok(authResponse);
        } catch (RuntimeException e) {
            if (e.getMessage() != null && e.getMessage().contains("not authenticated")) {
                // Return 401 instead of 500, so the frontend interceptor can handle token refresh
                return ResponseEntity.status(401).build();
            }
            throw e;
        }
    }
    
    private String getRefreshTokenFromCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            log.debug("No cookies found in request");
            return null;
        }
        log.info("Found {} cookies in request", cookies.length);
        
        // First, try to find cookie with path="/" (the correct one)
        String refreshTokenWithRootPath = null;
        String refreshTokenOther = null;
        
            for (Cookie cookie : cookies) {
            log.info("Cookie: name={}, path={}, maxAge={}", cookie.getName(), cookie.getPath(), cookie.getMaxAge());
                if ("refresh_token".equals(cookie.getName())) {
                String value = cookie.getValue();
                if (value != null) {
                    value = value.trim(); // Обрезаем пробелы
                }
                String cookiePath = cookie.getPath();
                
                // Prefer cookie with path="/" or path=null (which defaults to "/")
                if ("/".equals(cookiePath) || cookiePath == null) {
                    refreshTokenWithRootPath = value;
                    log.info("Refresh token cookie found with root path: length={}",
                        value != null ? value.length() : 0);
                } else {
                    // Store other path cookies but don't use them
                    refreshTokenOther = value;
                    log.warn("Found refresh_token cookie with non-root path '{}': length={}. This cookie should be deleted.", 
                        cookiePath,
                    value != null ? value.length() : 0);
                }
            }
        }
        
        // Return the cookie with root path if found, otherwise return null
        if (refreshTokenWithRootPath != null) {
            return refreshTokenWithRootPath;
            }
        
        if (refreshTokenOther != null) {
            log.warn("Only found refresh_token cookie with non-root path. This is likely an old cookie. Returning null to force re-login.");
            return null;
        }
        
        log.debug("Refresh token cookie not found");
        return null;
    }
}

