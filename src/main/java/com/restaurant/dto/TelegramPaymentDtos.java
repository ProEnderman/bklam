package com.restaurant.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class TelegramPaymentDtos {
    
    /** amount and orderNumber are optional; when null, backend computes from order/bookings by invoiceId */
    public record CreatePaymentRequestDto(
        @JsonProperty("invoiceId") String invoiceId,
        @JsonProperty("amount") Double amount,
        @JsonProperty("currency") String currency,
        @JsonProperty("orderNumber") String orderNumber
    ) {}
    
    public record PaymentRequestResponse(
        @JsonProperty("id") String id,
        @JsonProperty("invoiceId") String invoiceId,
        @JsonProperty("status") String status,
        @JsonProperty("createdAt") String createdAt,
        @JsonProperty("errorCode") String errorCode,
        @JsonProperty("errorMessage") String errorMessage,
        @JsonProperty("paymentLink") PaymentLinkResponse paymentLink
    ) {}
    
    public record PaymentLinkResponse(
        @JsonProperty("urlHash") String urlHash,
        @JsonProperty("expiresAt") String expiresAt,
        @JsonProperty("createdAt") String createdAt
    ) {}
    
    public record FallbackResponse(
        @JsonProperty("fallbackUrl") String fallbackUrl,
        @JsonProperty("message") String message,
        @JsonProperty("instructions") String instructions
    ) {}
    
    public record ManualUrlDto(
        @JsonProperty("url") String url
    ) {}
    
    // ============================================
    // MTProto DTOs
    // ============================================
    
    public record SendCodeDto(
        @JsonProperty("phone") String phone
    ) {}
    
    public record SendCodeResponse(
        @JsonProperty("phoneCodeHash") String phoneCodeHash,
        @JsonProperty("codeType") String codeType,
        @JsonProperty("timeout") Integer timeout
    ) {}
    
    public record ConfirmCodeDto(
        @JsonProperty("phone") String phone,
        @JsonProperty("phoneCodeHash") String phoneCodeHash,
        @JsonProperty("code") String code
    ) {}
    
    public record ConfirmCodeResponse(
        @JsonProperty("success") Boolean success,
        @JsonProperty("requires2FA") Boolean requires2FA
    ) {}
    
    public record ConfirmPasswordDto(
        @JsonProperty("phone") String phone,
        @JsonProperty("password") String password
    ) {}
    
    public record ConfirmPasswordResponse(
        @JsonProperty("success") Boolean success,
        @JsonProperty("sessionLinked") Boolean sessionLinked
    ) {}
    
    public record TelegramStatusResponse(
        @JsonProperty("linked") Boolean linked,
        @JsonProperty("hasActiveSession") Boolean hasActiveSession,
        @JsonProperty("telegramUsername") String telegramUsername,
        @JsonProperty("bankBotUsername") String bankBotUsername
    ) {}
    
    public record UpdateSettingsDto(
        @JsonProperty("bankBotUsername") String bankBotUsername
    ) {}
    
    public record SettingsResponse(
        @JsonProperty("bankBotUsername") String bankBotUsername
    ) {}
}
