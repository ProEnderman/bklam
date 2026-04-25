package com.restaurant.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateRestaurantRequest(
    @NotBlank(message = "Restaurant name is required")
    String name,
    @Size(max = 255, message = "Telegram bot token is too long")
    String telegramBotToken
) {}

