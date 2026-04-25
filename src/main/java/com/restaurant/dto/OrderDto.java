package com.restaurant.dto;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.restaurant.model.OrderStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record OrderDto(
    Long id,
    OrderStatus status,
    LocalDateTime createdAt,
    String createdBy,
    BigDecimal totalAmount,
    LocalDateTime closedAt,
    LocalDateTime paidAt,
    String unpaidReason,
    String name,
    Long tableId,
    String tableLabel,
    String hallName,
    String orderSource,
    Long guestId,
    String guestLabel,
    List<OrderItemDto> items,
    Boolean hasSplit,
    Boolean allPaymentSlotsPaid,
    /** Раскладка оплаты по split: для каждого счёта — индекс гостя-плательщика; null если не задано. */
    List<Integer> paymentAccountPayer
) {
    private static final ObjectMapper JSON = new ObjectMapper();

    private static List<Integer> parsePaymentAccountPayerJson(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return JSON.readValue(json, new TypeReference<List<Integer>>() {});
        } catch (Exception e) {
            return null;
        }
    }
    public static OrderDto fromEntity(com.restaurant.model.Order order) {
        return fromEntity(order, null, null, null, null, null);
    }

    public static OrderDto fromEntity(com.restaurant.model.Order order, String tableLabel, String hallName, String guestLabel) {
        return fromEntity(order, tableLabel, hallName, guestLabel, null, null);
    }

    public static OrderDto fromEntity(com.restaurant.model.Order order, String tableLabel, String hallName, String guestLabel, Boolean hasSplit, Boolean allPaymentSlotsPaid) {
        return new OrderDto(
            order.getId(),
            order.getStatus(),
            order.getCreatedAt(),
            order.getCreatedBy(),
            order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO,
            order.getClosedAt(),
            order.getPaidAt(),
            order.getUnpaidReason(),
            order.getName(),
            order.getTableId(),
            tableLabel,
            hallName,
            order.getOrderSource() != null ? order.getOrderSource().name() : null,
            order.getGuestId(),
            guestLabel,
            order.getItems().stream()
                .map(OrderItemDto::fromEntity)
                .toList(),
            hasSplit != null ? hasSplit : false,
            allPaymentSlotsPaid != null ? allPaymentSlotsPaid : true,
            parsePaymentAccountPayerJson(order.getPaymentAccountPayerJson())
        );
    }
}
