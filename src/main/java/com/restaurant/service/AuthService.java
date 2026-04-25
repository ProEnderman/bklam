package com.restaurant.service;

import com.restaurant.audit.AuditActions;
import com.restaurant.audit.StructuredAudit;
import com.restaurant.observability.BusinessMetrics;
import com.restaurant.dto.AuthResponse;
import com.restaurant.dto.LoginRequest;
import com.restaurant.dto.UserDto;
import com.restaurant.dto.VerifyCodeRequest;
import com.restaurant.exception.BusinessException;
import com.restaurant.model.RefreshToken;
import com.restaurant.model.User;
import com.restaurant.repository.RefreshTokenRepository;
import com.restaurant.repository.UserRepository;
import com.restaurant.repository.VerificationCodeRepository;
import com.restaurant.security.JwtTokenProvider;
import com.restaurant.security.UserPrincipal;
import com.restaurant.util.LogSanitizer;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
public class AuthService {
    
    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final VerificationCodeRepository verificationCodeRepository;
    private final JwtTokenProvider tokenProvider;
    private final AuthenticationManager authenticationManager;
    private final VerificationCodeService verificationCodeService;
    private final ActivityLogService activityLogService;
    private final org.springframework.jdbc.core.JdbcTemplate platformJdbcTemplate;
    private final BusinessMetrics businessMetrics;

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            VerificationCodeRepository verificationCodeRepository,
            JwtTokenProvider tokenProvider,
            AuthenticationManager authenticationManager,
            VerificationCodeService verificationCodeService,
            ActivityLogService activityLogService,
            @org.springframework.beans.factory.annotation.Qualifier("platformJdbcTemplate")
            org.springframework.jdbc.core.JdbcTemplate platformJdbcTemplate,
            BusinessMetrics businessMetrics) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.verificationCodeRepository = verificationCodeRepository;
        this.tokenProvider = tokenProvider;
        this.authenticationManager = authenticationManager;
        this.verificationCodeService = verificationCodeService;
        this.activityLogService = activityLogService;
        this.platformJdbcTemplate = platformJdbcTemplate;
        this.businessMetrics = businessMetrics;
    }
    
    @Transactional
    public String requestVerificationCode(LoginRequest request) {
        try {
            log.debug("Requesting verification code for email: {}", request.email());
            Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password())
            );
            
            UserPrincipal userPrincipal = (UserPrincipal) authentication.getPrincipal();
            User user = userRepository.findById(userPrincipal.getId())
                .orElseThrow(() -> new RuntimeException("User not found with ID: " + userPrincipal.getId()));
            
            // Генерируем и отправляем код подтверждения, получаем challenge_id
            String challengeId = verificationCodeService.generateAndSendCode(user);
            
            log.debug("Verification code sent to: {}, challengeId: {}", user.getUsername(), challengeId);
            return challengeId;
        } catch (org.springframework.security.authentication.BadCredentialsException e) {
            businessMetrics.incrementAuthFailure();
            auditAuthCredentialsFailure(request.email(), "BAD_CREDENTIALS");
            log.error("Bad credentials for email: {}", request.email(), e);
            throw new BusinessException("Invalid email or password");
        } catch (org.springframework.security.core.userdetails.UsernameNotFoundException e) {
            businessMetrics.incrementAuthFailure();
            auditAuthCredentialsFailure(request.email(), "USER_NOT_FOUND");
            log.error("User not found for email: {}", request.email(), e);
            throw new BusinessException("Invalid email or password");
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            businessMetrics.incrementAuthFailure();
            auditAuthCredentialsFailure(request.email(), "ERROR");
            log.error("Error requesting verification code for email: {}", request.email(), e);
            // Показываем более детальную ошибку для отладки
            String errorMessage = e.getMessage() != null ? e.getMessage() : "Failed to request verification code";
            throw new BusinessException("Failed to request verification code: " + errorMessage);
        }
    }
    
    @Transactional
    public AuthResponse verifyCodeAndLogin(String challengeId, String code, HttpServletResponse response) {
        try {
            log.debug("Verifying code for challengeId: {}", challengeId);
            
            // Получаем challenge до проверки кода, чтобы иметь доступ к пользователю
            com.restaurant.model.VerificationCode verificationCode = verificationCodeRepository
                .findByChallengeIdAndUsedFalse(challengeId)
                .orElseThrow(() -> new BusinessException("Invalid or expired challenge"));
            
            // Сохраняем пользователя до проверки кода
            User user = verificationCode.getUser();
            
            // Проверяем код подтверждения по challenge_id (БЕЗ повторной проверки пароля)
            // verifyCode выбрасывает BusinessException с детальным сообщением при ошибке
            // и помечает код как used при успехе
            verificationCodeService.verifyCode(challengeId, code);
            
            // Аутентифицируем пользователя
            UserPrincipal userPrincipal = UserPrincipal.create(user);
            Authentication authentication = new UsernamePasswordAuthenticationToken(
                userPrincipal, null, userPrincipal.getAuthorities()
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);
            
            // Генерируем токены (locationId для tenant context)
            String accessToken = tokenProvider.generateAccessToken(
                user.getId(),
                user.getUsername(),
                user.getRole().name(),
                user.getRestaurantId(),
                user.getLocationId()
            );
            
            String refreshTokenValue = tokenProvider.generateRefreshToken();
            
            // Сохраняем refresh token (обрезаем пробелы)
            String trimmedRefreshTokenValue = refreshTokenValue.trim();
            log.info("Creating refresh token for user {}: {}", user.getUsername(),
                LogSanitizer.tokenState(trimmedRefreshTokenValue));
            
            RefreshToken refreshToken = new RefreshToken();
            refreshToken.setUser(user);
            refreshToken.setToken(trimmedRefreshTokenValue);
            refreshToken.setExpiresAt(LocalDateTime.now().plusDays(30));
            refreshToken.setRevoked(false);
            
            // Сохраняем токен и принудительно коммитим транзакцию
            RefreshToken savedRefreshToken = refreshTokenRepository.saveAndFlush(refreshToken);
            log.info("Refresh token saved: id={}, token length={}, expiresAt={}", 
                savedRefreshToken.getId(),
                savedRefreshToken.getToken() != null ? savedRefreshToken.getToken().length() : 0,
                savedRefreshToken.getExpiresAt());
            
            // Проверяем, что токен действительно сохранился
            java.util.Optional<RefreshToken> verifyToken = refreshTokenRepository.findByToken(trimmedRefreshTokenValue);
            if (verifyToken.isEmpty()) {
                log.error("CRITICAL: Refresh token was saved but cannot be found immediately after save! tokenId={}",
                    savedRefreshToken.getId());
            } else {
                RefreshToken foundToken = verifyToken.get();
                log.info("Refresh token saved and verified for user {}: tokenId={}, expiresAt={}, foundTokenId={}", 
                    user.getUsername(), 
                    savedRefreshToken.getId(), 
                    savedRefreshToken.getExpiresAt(),
                    foundToken.getId());
            }
            
            // Устанавливаем cookies (используем обрезанный токен)
            setAccessTokenCookie(response, accessToken);
            setRefreshTokenCookie(response, trimmedRefreshTokenValue);
            
            log.info("Login successful for user: {}, refresh token set in cookie, tokenId={}", 
                user.getUsername(), savedRefreshToken.getId());
            
            // Создаем ответ ДО логирования активности, чтобы убедиться, что токен сохранен
            AuthResponse responseObj = new AuthResponse(
                UserDto.fromEntity(user),
                "Login successful"
            );
            
            // Логируем вход в систему ПОСЛЕ успешного сохранения токена и создания ответа
            // Это гарантирует, что даже если логирование упадет, токен уже сохранен
            try {
                activityLogService.logActivity(
                    "LOGIN",
                    "AUTH",
                    user.getId(),
                    user.getUsername(),
                    String.format("Пользователь %s выполнил вход в систему", user.getUsername()),
                    null,
                    Map.of("userId", user.getId(), 
                           "username", user.getUsername(), 
                           "role", user.getRole().toString(), 
                           "restaurantId", user.getRestaurantId() != null ? user.getRestaurantId() : 0L,
                           "refreshTokenId", savedRefreshToken.getId())
                );
            } catch (Exception e) {
                log.error("Failed to log login activity: {}", e.getMessage());
                // Не пробрасываем исключение - токен уже сохранен
            }

            businessMetrics.incrementAuthSuccess();
            auditLoginSuccess(user);
            return responseObj;
        } catch (BusinessException e) {
            businessMetrics.incrementAuthFailure();
            throw e;
        } catch (Exception e) {
            businessMetrics.incrementAuthFailure();
            log.error("Error verifying code for challengeId: {}", challengeId, e);
            throw new BusinessException("Failed to verify code");
        }
    }
    
    // Старый метод для обратной совместимости (deprecated)
    // ВАЖНО: Этот метод не будет работать правильно с новой системой challenge-based кодов
    // Рекомендуется использовать новый подход с challengeId
    @Deprecated
    @Transactional
    public AuthResponse verifyCodeAndLogin(LoginRequest loginRequest, VerifyCodeRequest verifyRequest, HttpServletResponse response) {
        // Для обратной совместимости - используем старый подход с повторной проверкой пароля
        // ВАЖНО: Этот метод требует доработки для работы с новой системой
        // В будущем этот метод должен быть удален
        try {
            log.warn("Using deprecated verifyCodeAndLogin method for email: {}", loginRequest.email());
            
            authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(loginRequest.email(), loginRequest.password())
            );
            
            // Проверяем учетные данные (для обратной совместимости)
            // Но затем выбрасываем исключение, так как старый метод не поддерживается
            // ВАЖНО: Старый метод небезопасен, так как не использует challenge_id
            // Рекомендуется перейти на новый API с challenge-based подходом
            throw new BusinessException("Legacy verification method is not supported. Please use challenge-based approach.");
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error in deprecated verifyCodeAndLogin", e);
            throw new BusinessException("Failed to verify code");
        }
    }
    
    @Transactional
    public void logout(String refreshTokenValue, HttpServletResponse response) {
        // Revoke by SecurityContext if present (e.g. when request was authenticated by JWT)
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof UserPrincipal) {
            UserPrincipal userPrincipal = (UserPrincipal) authentication.getPrincipal();
            logOutAndRevoke(userPrincipal.getId());
        } else if (refreshTokenValue != null && !refreshTokenValue.isBlank()) {
            // JWT filter skips /api/auth/logout so context is often empty; revoke using cookie
            Optional<RefreshToken> rt = refreshTokenRepository.findByTokenTrimmed(refreshTokenValue.trim());
            rt.ifPresent(r -> {
                Long userId = r.getUser().getId();
                log.info("Revoking refresh token for user id {} from logout cookie", userId);
                logOutAndRevoke(userId);
            });
        }

        // Always clear auth cookies so the next login is clean
        deleteAccessTokenCookie(response);
        deleteRefreshTokenCookie(response);
    }

    private void logOutAndRevoke(Long userId) {
        try {
            User user = userRepository.findById(userId).orElse(null);
            if (user != null) {
                activityLogService.logActivity(
                    "LOGOUT",
                    "AUTH",
                    user.getId(),
                    user.getUsername(),
                    String.format("Пользователь %s вышел из системы", user.getUsername()),
                    Map.of("userId", user.getId(), "username", user.getUsername()),
                    null
                );
            }
        } catch (Exception e) {
            log.error("Failed to log logout activity: {}", e.getMessage());
        }
        refreshTokenRepository.revokeAllUserTokens(userId);
    }
    
    @Transactional
    public AuthResponse refresh(String refreshTokenValue, HttpServletResponse response) {
        log.info("Refreshing token... {}", LogSanitizer.tokenState(refreshTokenValue));
        
        if (refreshTokenValue == null || refreshTokenValue.isEmpty()) {
            log.warn("Refresh token is null or empty");
            auditTokenRefreshFailure("MISSING");
            throw new BusinessException("Refresh token is required");
        }
        
        // Обрезаем пробелы и проверяем токен
        String trimmedToken = refreshTokenValue.trim();
        log.info("Searching for refresh token (trimmed): {}", LogSanitizer.tokenState(trimmedToken));
        
        // Проверяем, есть ли такой токен в базе
        java.util.Optional<RefreshToken> tokenOptional = refreshTokenRepository.findByToken(trimmedToken);
        
        if (tokenOptional.isPresent()) {
            log.info("Token found by exact match: id={}", tokenOptional.get().getId());
        } else {
            log.warn("Token not found by exact match, trying trimmed search...");
        }
        
        // Если не нашли точное совпадение, пробуем поиск с TRIM в запросе
        if (tokenOptional.isEmpty()) {
            tokenOptional = refreshTokenRepository.findByTokenTrimmed(trimmedToken);
            if (tokenOptional.isPresent()) {
                log.info("Token found by trimmed search: id={}", tokenOptional.get().getId());
            }
        }
        
        if (tokenOptional.isEmpty()) {
            // Пробуем найти все токены для отладки
            log.warn("Refresh token not found in database.");
            log.warn("Token length: {}, Total refresh tokens in DB: {}", trimmedToken.length(), refreshTokenRepository.count());
            
            // Попробуем найти все токены для отладки
            try {
                List<RefreshToken> allTokens = refreshTokenRepository.findAll();
                log.warn("All tokens in DB count: {}", allTokens.size());
                
                // Проверяем все токены вручную на совпадение после trim
                for (RefreshToken token : allTokens) {
                    String tokenValue = token.getToken();
                    if (tokenValue != null) {
                        String tokenValueTrimmed = tokenValue.trim();
                        if (tokenValueTrimmed.equals(trimmedToken)) {
                            log.warn("Found token with whitespace differences! Token ID: {}, original length: {}",
                                token.getId(), tokenValue.length());
                            tokenOptional = java.util.Optional.of(token);
                            break;
                        }
                        // Также проверяем без trim для обеих сторон
                        if (tokenValue.equals(trimmedToken)) {
                            log.warn("Found token by exact match in manual search! Token ID: {}", token.getId());
                            tokenOptional = java.util.Optional.of(token);
                            break;
                        }
                    }
                }
                
                if (tokenOptional.isEmpty() && !allTokens.isEmpty()) {
                    RefreshToken firstToken = allTokens.get(0);
                    String firstTokenValue = firstToken.getToken();
                    log.warn("Sample token in DB: id={}, token length={}, expiresAt={}, revoked={}", 
                        firstToken.getId(), 
                        firstTokenValue != null ? firstTokenValue.length() : 0,
                        firstToken.getExpiresAt(),
                        firstToken.getRevoked());
                }
            } catch (Exception e) {
                log.error("Error during debug logging: {}", e.getMessage(), e);
            }
            
            if (tokenOptional.isEmpty()) {
                log.error("Refresh token not found in database. Cannot proceed with refresh.");
                auditTokenRefreshFailure("NOT_FOUND");
                throw new BusinessException("Invalid refresh token");
            }
        }
        
        RefreshToken refreshToken = tokenOptional.get();
        log.info("Refresh token found for user: {}", refreshToken.getUser().getUsername());
        
        if (refreshToken.isExpired()) {
            log.warn("Refresh token expired for user: {}", refreshToken.getUser().getUsername());
            refreshTokenRepository.delete(refreshToken);
            auditTokenRefreshFailure("EXPIRED");
            throw new BusinessException("Refresh token expired");
        }
        
        if (refreshToken.getRevoked() != null && refreshToken.getRevoked()) {
            log.warn("Refresh token revoked for user: {}", refreshToken.getUser().getUsername());
            auditTokenRefreshFailure("REVOKED");
            throw new BusinessException("Refresh token revoked");
        }
        
        User user = refreshToken.getUser();
        
        // Генерируем новый access token (locationId для tenant context)
        String newAccessToken = tokenProvider.generateAccessToken(
            user.getId(),
            user.getUsername(),
            user.getRole().name(),
            user.getRestaurantId(),
            user.getLocationId()
        );
        
        // НЕ ротируем refresh token при каждом refresh - это может привести к потере токена
        // если пользователь закрыл страницу до установки нового токена в cookie
        // Ротируем только access token
        // Если нужно ротировать refresh token, делаем это только при подозрении на компрометацию
        
        // Устанавливаем новые cookies
        setAccessTokenCookie(response, newAccessToken);
        // Оставляем старый refresh token в cookie и базе
        
        log.info("Token refreshed successfully for user: {}, new refresh token set in cookie", user.getUsername());
        
        // REFRESH_TOKEN не логируем в Activity Log, чтобы не захламлять журнал
        auditTokenRefreshSuccess(user);

        return new AuthResponse(
            UserDto.fromEntity(user),
            "Token refreshed successfully"
        );
    }
    
    /**
     * Runs on scheduler thread (no request context); uses platform DS to clean up across all tenants.
     * {@code refresh_tokens} is a global session table; DELETE only by expiry time (no unscoped tenant fact reads).
     */
    @Scheduled(cron = "0 0 3 * * ?")
    @SchedulerLock(name = "Auth.cleanupExpiredRefreshTokens", lockAtLeastFor = "10s", lockAtMostFor = "2h")
    public void cleanupExpiredRefreshTokens() {
        try {
            int deleted = platformJdbcTemplate.update(
                    "DELETE FROM refresh_tokens WHERE expires_at < ?", LocalDateTime.now());
            if (deleted > 0) {
                log.info("Cleaned up {} expired refresh tokens", deleted);
            }
        } catch (Exception e) {
            log.error("Failed to cleanup expired refresh tokens: {}", e.getMessage(), e);
        }
    }
    
    @Transactional(readOnly = true)
    public AuthResponse getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal)) {
            throw new RuntimeException("User not authenticated");
        }
        
        UserPrincipal userPrincipal = (UserPrincipal) authentication.getPrincipal();
        User user = userRepository.findById(userPrincipal.getId())
            .orElseThrow(() -> new RuntimeException("User not found"));
        
        // Принудительно загружаем Restaurant внутри транзакции, чтобы избежать LazyInitializationException
        if (user.getRestaurant() != null) {
            user.getRestaurant().getName(); // Триггерим загрузку LAZY ассоциации
        }
        
        return new AuthResponse(
            UserDto.fromEntity(user),
            "User retrieved successfully"
        );
    }
    
    private void setAccessTokenCookie(HttpServletResponse response, String token) {
        Cookie cookie = new Cookie("access_token", token);
        cookie.setHttpOnly(true);
        // Secure: автоматически определяется по протоколу или через переменную окружения
        // В продакшене (HTTPS) будет true, в локальной разработке (HTTP) - false
        boolean isSecure = determineSecureFlag();
        cookie.setSecure(isSecure);
        cookie.setPath("/");
        cookie.setMaxAge(15 * 60); // 15 minutes
        cookie.setAttribute("SameSite", "Lax"); // Можно использовать "Strict" если нет кросс-доменных сценариев
        response.addCookie(cookie);
        log.debug("Access token cookie set: HttpOnly=true, Secure={}, Path=/, MaxAge={}", isSecure, 15 * 60);
    }
    
    private void setRefreshTokenCookie(HttpServletResponse response, String token) {
        // First, delete any old refresh_token cookies with different paths
        // This ensures we don't have multiple cookies with the same name
        deleteRefreshTokenCookieWithPath(response, "/");
        deleteRefreshTokenCookieWithPath(response, "/api/auth/refresh");
        deleteRefreshTokenCookieWithPath(response, "/api");
        
        // Now set the new cookie with path="/"
        Cookie cookie = new Cookie("refresh_token", token);
        cookie.setHttpOnly(true);
        // Secure: автоматически определяется по протоколу или через переменную окружения
        // В продакшене (HTTPS) будет true, в локальной разработке (HTTP) - false
        boolean isSecure = determineSecureFlag();
        cookie.setSecure(isSecure);
        cookie.setPath("/"); // Изменено с "/api/auth/refresh" на "/" для доступа из всех запросов
        cookie.setMaxAge(30 * 24 * 60 * 60); // 30 days
        cookie.setAttribute("SameSite", "Lax");
        response.addCookie(cookie);
        log.info("Refresh token cookie set: HttpOnly=true, Secure={}, Path=/, MaxAge={}, Token length={}", 
                  isSecure, 30 * 24 * 60 * 60, token != null ? token.length() : 0);
    }
    
    /**
     * Определяет, должен ли флаг Secure быть установлен для cookies.
     * 
     * Логика:
     * 1. Если установлена переменная окружения COOKIE_SECURE=true, используем её
     * 2. Если установлено системное свойство cookie.secure=true, используем его
     * 3. Иначе автоматически определяем по протоколу (HTTPS = true, HTTP = false)
     * 
     * В продакшене рекомендуется использовать HTTPS, тогда Secure будет автоматически true.
     * Для локальной разработки на HTTP Secure будет false (иначе cookies не будут работать).
     * 
     * @return true если cookies должны быть Secure (только HTTPS), false иначе
     */
    private boolean determineSecureFlag() {
        // Приоритет 1: Явная настройка через переменную окружения
        String envSecure = System.getenv("COOKIE_SECURE");
        if (envSecure != null) {
            boolean result = "true".equalsIgnoreCase(envSecure);
            log.debug("Cookie Secure flag from COOKIE_SECURE env: {}", result);
            return result;
        }
        
        // Приоритет 2: Явная настройка через системное свойство
        String propSecure = System.getProperty("cookie.secure");
        if (propSecure != null) {
            boolean result = Boolean.parseBoolean(propSecure);
            log.debug("Cookie Secure flag from cookie.secure property: {}", result);
            return result;
        }
        
        // Приоритет 3: Автоматическое определение по протоколу
        // Проверяем, используется ли HTTPS (например, через X-Forwarded-Proto header или порт)
        // В Spring Boot приложениях обычно используется переменная окружения или профиль
        // Для простоты проверяем стандартные индикаторы HTTPS
        
        // Если приложение работает за reverse proxy (nginx, load balancer), 
        // обычно используется переменная окружения или header
        // Здесь мы предполагаем, что если не указано явно, то в продакшене будет HTTPS
        // и Secure должен быть true для безопасности
        
        // ВАЖНО: Для локальной разработки на HTTP это вернет false,
        // что правильно, так как Secure cookies не работают на HTTP
        
        // Проверяем профиль Spring (если используется)
        String activeProfile = System.getProperty("spring.profiles.active");
        if (activeProfile != null && (activeProfile.contains("prod") || activeProfile.contains("production"))) {
            log.debug("Cookie Secure flag: true (production profile detected)");
            return true;
        }
        
        // По умолчанию для безопасности: если не указано явно и не локальная разработка,
        // предполагаем, что нужен Secure. Но для локальной разработки это может быть проблемой.
        // Поэтому лучше явно указывать через переменную окружения.
        
        // Безопасный выбор по умолчанию: false для локальной разработки
        // В продакшене ДОЛЖНА быть установлена переменная окружения COOKIE_SECURE=true
        log.debug("Cookie Secure flag: false (default, set COOKIE_SECURE=true for production)");
        return false;
    }
    
    private void deleteRefreshTokenCookieWithPath(HttpServletResponse response, String path) {
        Cookie cookie = new Cookie("refresh_token", "");
        cookie.setHttpOnly(true);
        cookie.setSecure(determineSecureFlag()); // Используем тот же Secure флаг при удалении
        cookie.setPath(path);
        cookie.setMaxAge(0);
        response.addCookie(cookie);
        log.debug("Deleted refresh_token cookie with path: {}", path);
    }
    
    private void deleteAccessTokenCookie(HttpServletResponse response) {
        Cookie cookie = new Cookie("access_token", "");
        cookie.setHttpOnly(true);
        cookie.setSecure(determineSecureFlag()); // Используем тот же Secure флаг при удалении
        cookie.setPath("/");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
    }
    
    private void deleteRefreshTokenCookie(HttpServletResponse response) {
        // Delete cookies with all possible paths to ensure complete cleanup
        deleteRefreshTokenCookieWithPath(response, "/");
        deleteRefreshTokenCookieWithPath(response, "/api/auth/refresh");
        deleteRefreshTokenCookieWithPath(response, "/api");
    }

    private void auditLoginSuccess(User user) {
        try {
            HashMap<String, Object> m = new HashMap<>();
            m.put("userId", user.getId());
            if (user.getRestaurant() != null) {
                m.put("restaurantId", user.getRestaurant().getId());
            }
            StructuredAudit.success(AuditActions.LOGIN_SUCCESS, m);
        } catch (RuntimeException ignored) {
        }
    }

    private void auditAuthCredentialsFailure(String email, String reason) {
        try {
            HashMap<String, Object> m = new HashMap<>();
            m.put("reason", reason);
            if (email != null && !email.isBlank()) {
                m.put("subject", email.trim());
            }
            StructuredAudit.failure(AuditActions.AUTH_CREDENTIALS_FAILURE, m);
        } catch (RuntimeException ignored) {
        }
    }

    private void auditTokenRefreshSuccess(User user) {
        try {
            HashMap<String, Object> m = new HashMap<>();
            m.put("userId", user.getId());
            if (user.getRestaurant() != null) {
                m.put("restaurantId", user.getRestaurant().getId());
            }
            StructuredAudit.success(AuditActions.TOKEN_REFRESH_SUCCESS, m);
        } catch (RuntimeException ignored) {
        }
    }

    private void auditTokenRefreshFailure(String reason) {
        try {
            HashMap<String, Object> m = new HashMap<>();
            m.put("reason", reason);
            StructuredAudit.failure(AuditActions.TOKEN_REFRESH_FAILURE, m);
        } catch (RuntimeException ignored) {
        }
    }
}

