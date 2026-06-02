package com.restaurant.dto;

import com.restaurant.util.AuthInputNormalizer;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
    @NotBlank(message = "Email or username is required")
    @Size(max = AuthInputNormalizer.MAX_LOGIN_IDENTIFIER_LENGTH, message = "Email or username is too long")
    @Email(message = "Invalid email format")
    String email, // На самом деле это username, но оставляем название email для обратной совместимости

    @NotBlank(message = "Password is required")
    @Size(min = 8, max = AuthInputNormalizer.MAX_PASSWORD_CHAR_LENGTH, message = "Invalid password length")
    String password
) {}

