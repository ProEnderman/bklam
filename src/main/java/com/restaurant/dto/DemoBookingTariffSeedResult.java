package com.restaurant.dto;

import java.util.Map;

public record DemoBookingTariffSeedResult(
    int bookingsCreated,
    int bookingOrdersCreated,
    int activitiesCreated,
    Map<String, Integer> scenarioBreakdown,
    Map<String, Integer> existingActivitiesUsed,
    String message,
    java.util.List<String> errors,
    /** For batched cohort-retention seed: pass as startClientSeq on the next request. */
    int nextClientSeq
) {}
