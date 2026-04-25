package com.restaurant.exception;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.Instant;

/**
 * Standard JSON body for API errors.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiErrorResponse(
        String timestamp,
        int status,
        String error,
        String code,
        String message,
        String path,
        String requestId
) {
    public static ApiErrorResponse of(HttpServletRequest request, HttpStatus httpStatus, String code, String message) {
        String rid = MDC.get("reqId");
        if (rid != null && rid.isEmpty()) {
            rid = null;
        }
        return new ApiErrorResponse(
                Instant.now().toString(),
                httpStatus.value(),
                httpStatus.name(),
                code,
                message,
                resolvePath(request),
                rid
        );
    }

    private static String resolvePath(HttpServletRequest request) {
        if (request != null && request.getRequestURI() != null) {
            return request.getRequestURI();
        }
        var attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes sra) {
            var req = sra.getRequest();
            return req.getRequestURI() != null ? req.getRequestURI() : "";
        }
        return "";
    }
}
