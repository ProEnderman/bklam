package com.restaurant.dto;

import java.time.LocalDateTime;

public record CreateSessionResponse(
    String sessionToken,
    LocalDateTime expiresAt
) {}
