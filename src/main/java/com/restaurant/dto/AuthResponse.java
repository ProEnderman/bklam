package com.restaurant.dto;

public record AuthResponse(
    UserDto user,
    String message
) {}

