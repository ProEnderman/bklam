package com.restaurant.dto.loyalty;

import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

public record CreateGuestRequest(
    @NotBlank String phone,
    String name,
    String email,
    LocalDate birthday
) {}
