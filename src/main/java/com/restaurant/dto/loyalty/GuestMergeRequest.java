package com.restaurant.dto.loyalty;

import jakarta.validation.constraints.NotNull;

public record GuestMergeRequest(
    @NotNull Long sourceGuestId,
    @NotNull Long targetGuestId
) {}
