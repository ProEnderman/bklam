package com.restaurant.dto;

import jakarta.validation.constraints.NotNull;

/** Запрос на обновление срока действия QR-токена меню. */
public record UpdateQrMenuExpiryRequest(
    /** Новая дата/время истечения (UTC или локальное — сервер трактует как локальное). */
    @NotNull
    java.time.LocalDateTime expiresAt
) {}
