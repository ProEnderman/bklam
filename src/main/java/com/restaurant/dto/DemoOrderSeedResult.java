package com.restaurant.dto;

public record DemoOrderSeedResult(
    int ordersCreated,
    int ordersClosed,
    int ordersPaid,
    int ordersWithSplit,
    int guestsCreated,
    int ingredientsStocked,
    String message
) {}
