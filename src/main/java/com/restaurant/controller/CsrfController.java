package com.restaurant.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Triggers CSRF token creation (cookie is set by Spring Security when this endpoint is hit).
 * SPA can call GET /api/auth/csrf before making mutating requests to ensure the cookie exists.
 */
@RestController
@RequestMapping("/api/auth")
public class CsrfController {

    @GetMapping("/csrf")
    public ResponseEntity<Map<String, String>> csrf(CsrfToken csrfToken) {
        return ResponseEntity.ok(Map.of(
            "token", csrfToken.getToken(),
            "headerName", csrfToken.getHeaderName(),
            "parameterName", csrfToken.getParameterName()
        ));
    }
}
