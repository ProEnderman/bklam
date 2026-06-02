package com.restaurant.exception;

import com.restaurant.controller.PublicOrderingController;
import com.restaurant.service.PublicOrderingService;
import com.restaurant.service.SplitBillService;
import com.restaurant.service.TelegramOrderingService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidationExceptions(
            MethodArgumentNotValidException ex, HttpServletRequest request) {
        log.warn("Validation error: {}", ex.getMessage());
        String detail = ex.getBindingResult().getAllErrors().stream()
                .map(error -> {
                    if (error instanceof FieldError fe) {
                        return fe.getField() + ": " + fe.getDefaultMessage();
                    }
                    return error.getDefaultMessage();
                })
                .collect(Collectors.joining("; "));
        String message = detail.isBlank() ? "Validation failed" : detail;
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(request, HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", message));
    }

    @ExceptionHandler(BindException.class)
    public ResponseEntity<ApiErrorResponse> handleBindException(BindException ex, HttpServletRequest request) {
        log.warn("Bind error: {}", ex.getMessage());
        String message = ex.getBindingResult().getAllErrors().stream()
                .map(err -> err instanceof FieldError fe
                        ? fe.getField() + ": " + fe.getDefaultMessage()
                        : err.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(request, HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                        message.isBlank() ? "Validation failed" : message));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleConstraintViolation(
            ConstraintViolationException ex, HttpServletRequest request) {
        log.warn("Constraint violation: {}", ex.getMessage());
        String message = ex.getConstraintViolations().stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(request, HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                        message.isBlank() ? "Validation failed" : message));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleNotReadable(
            HttpMessageNotReadableException ex, HttpServletRequest request) {
        log.warn("Malformed request body: {}", ex.getMessage());
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(request, HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST",
                        "Некорректное тело запроса."));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiErrorResponse> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex, HttpServletRequest request) {
        log.warn("Type mismatch: {}", ex.getMessage());
        String msg = "Неверный параметр запроса.";
        if (ex.getName() != null) {
            msg = "Неверный формат параметра: " + ex.getName();
        }
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(request, HttpStatus.BAD_REQUEST, "BAD_REQUEST", msg));
    }

    @ExceptionHandler(PublicOrderingController.InvalidSessionException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidGuestSession(
            PublicOrderingController.InvalidSessionException ex, HttpServletRequest request) {
        log.warn("Invalid guest session: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiErrorResponse.of(request, HttpStatus.UNAUTHORIZED,
                        ((HasApiErrorCode) ex).getApiErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(PublicOrderingService.AccessDeniedException.class)
    public ResponseEntity<ApiErrorResponse> handlePublicOrderingAccessDenied(
            PublicOrderingService.AccessDeniedException ex, HttpServletRequest request) {
        log.warn("Public ordering access denied: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiErrorResponse.of(request, HttpStatus.FORBIDDEN, ex.getApiErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(TelegramOrderingService.AccessDeniedException.class)
    public ResponseEntity<ApiErrorResponse> handleTelegramAccessDenied(
            TelegramOrderingService.AccessDeniedException ex, HttpServletRequest request) {
        log.warn("Telegram ordering access denied: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiErrorResponse.of(request, HttpStatus.FORBIDDEN, ex.getApiErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiErrorResponse> handleAccessDenied(
            AccessDeniedException ex, HttpServletRequest request) {
        log.warn("Access denied: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiErrorResponse.of(request, HttpStatus.FORBIDDEN, "ACCESS_DENIED",
                        "Доступ запрещён."));
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNoHandler(NoHandlerFoundException ex, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiErrorResponse.of(request, HttpStatus.NOT_FOUND, "NOT_FOUND", "Ресурс не найден."));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNoResource(NoResourceFoundException ex, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiErrorResponse.of(request, HttpStatus.NOT_FOUND, "NOT_FOUND", "Ресурс не найден."));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiErrorResponse> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(ApiErrorResponse.of(request, HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED",
                        "Метод не поддерживается для этого пути."));
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleResourceNotFound(ResourceNotFoundException ex, HttpServletRequest request) {
        log.warn("Resource not found: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiErrorResponse.of(request, HttpStatus.NOT_FOUND, ex.getApiErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(PublicOrderingService.OrderConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleOrderConflict(
            PublicOrderingService.OrderConflictException ex, HttpServletRequest request) {
        log.warn("Order conflict: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiErrorResponse.of(request, HttpStatus.CONFLICT, ex.getApiErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(SplitBillService.SplitConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleSplitConflict(
            SplitBillService.SplitConflictException ex, HttpServletRequest request) {
        log.warn("Split conflict: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiErrorResponse.of(request, HttpStatus.CONFLICT, ex.getApiErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(InsufficientStockException.class)
    public ResponseEntity<ApiErrorResponse> handleInsufficientStock(
            InsufficientStockException ex, HttpServletRequest request) {
        log.warn("Insufficient stock: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiErrorResponse.of(request, HttpStatus.CONFLICT, ex.getApiErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(IpVerificationLockedException.class)
    public ResponseEntity<ApiErrorResponse> handleIpVerificationLocked(
            IpVerificationLockedException ex, HttpServletRequest request) {
        log.warn("Verification IP lockout: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                .body(ApiErrorResponse.of(request, HttpStatus.TOO_MANY_REQUESTS, ex.getApiErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiErrorResponse> handleBusinessException(BusinessException ex, HttpServletRequest request) {
        log.warn("Business exception: {}", ex.getMessage());
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(request, HttpStatus.BAD_REQUEST, ex.getApiErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(org.springframework.security.authentication.BadCredentialsException.class)
    public ResponseEntity<ApiErrorResponse> handleBadCredentials(
            org.springframework.security.authentication.BadCredentialsException ex, HttpServletRequest request) {
        log.warn("Bad credentials");
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiErrorResponse.of(request, HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS",
                        "Неверный email или пароль."));
    }

    /** Payment service unreachable (connection refused, timeout). */
    @ExceptionHandler(ResourceAccessException.class)
    public ResponseEntity<ApiErrorResponse> handleResourceAccess(ResourceAccessException ex, HttpServletRequest request) {
        log.error("Payment service unreachable: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(ApiErrorResponse.of(request, HttpStatus.BAD_GATEWAY, "PAYMENT_SERVICE_UNAVAILABLE",
                        "Сервис оплаты недоступен. Попробуйте позже."));
    }

    /** Payment service returned 5xx. */
    @ExceptionHandler(HttpServerErrorException.class)
    public ResponseEntity<ApiErrorResponse> handleHttpServerError(HttpServerErrorException ex, HttpServletRequest request) {
        log.error("Payment service error {}: {}", ex.getStatusCode(), ex.getResponseBodyAsString(), ex);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(ApiErrorResponse.of(request, HttpStatus.BAD_GATEWAY, "PAYMENT_SERVICE_ERROR",
                        "Ошибка сервиса оплаты. Попробуйте позже."));
    }

    /** Payment service returned 4xx (e.g. 401, 400). */
    @ExceptionHandler(HttpClientErrorException.class)
    public ResponseEntity<ApiErrorResponse> handleHttpClientError(HttpClientErrorException ex, HttpServletRequest request) {
        log.warn("Payment service client error {}: {}", ex.getStatusCode(), ex.getResponseBodyAsString());
        HttpStatus st = HttpStatus.resolve(ex.getStatusCode().value());
        if (st == null) {
            st = HttpStatus.BAD_REQUEST;
        }
        return ResponseEntity.status(st)
                .body(ApiErrorResponse.of(request, st, "PAYMENT_REQUEST_FAILED",
                        "Запрос к сервису оплаты отклонён."));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiErrorResponse> handleIllegalState(IllegalStateException ex, HttpServletRequest request) {
        log.warn("Illegal state: {}", ex.getMessage());
        String msg = ex.getMessage() != null ? ex.getMessage() : "Invalid request state";
        if (msg.contains("not authenticated")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiErrorResponse.of(request, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED",
                            "Требуется авторизация."));
        }
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(request, HttpStatus.BAD_REQUEST, "BAD_REQUEST", msg));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorResponse> handleIllegalArgument(IllegalArgumentException ex, HttpServletRequest request) {
        log.warn("Invalid argument: {}", ex.getMessage());
        String msg = ex.getMessage() != null ? ex.getMessage() : "Неверные параметры запроса.";
        return ResponseEntity.badRequest()
                .body(ApiErrorResponse.of(request, HttpStatus.BAD_REQUEST, "BAD_REQUEST", msg));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleGenericException(Exception ex, HttpServletRequest request) {
        log.error("Unexpected error: ", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiErrorResponse.of(request, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                        "Произошла внутренняя ошибка. Попробуйте позже."));
    }
}
