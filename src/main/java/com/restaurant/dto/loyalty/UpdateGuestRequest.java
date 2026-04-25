package com.restaurant.dto.loyalty;

import java.time.LocalDate;

public record UpdateGuestRequest(
    String name,
    String email,
    LocalDate birthday
) {}
