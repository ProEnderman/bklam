package com.restaurant.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record QrMenuConfigDto(
    String menuQrUrl,
    LocalDateTime expiresAt,
    Boolean expired
) {}
