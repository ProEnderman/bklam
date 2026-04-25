package com.restaurant.controller;

import com.restaurant.dto.TelegramPaymentDtos;
import com.restaurant.service.TelegramPaymentProxyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Telegram Payment", description = "Telegram payment link generation proxy")
@RestController
@RequestMapping("/api/telegram-payment")
@RequiredArgsConstructor
public class TelegramPaymentController {
    
    private final TelegramPaymentProxyService proxyService;
    
    @Operation(summary = "Create payment request", description = "Create a payment request to generate QR code")
    @PostMapping("/payment_requests")
    public ResponseEntity<TelegramPaymentDtos.PaymentRequestResponse> createPaymentRequest(
        @Valid @RequestBody TelegramPaymentDtos.CreatePaymentRequestDto request
    ) {
        TelegramPaymentDtos.PaymentRequestResponse response = 
            proxyService.createPaymentRequest(request);
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Get payment request status")
    @GetMapping("/payment_requests/{id}")
    public ResponseEntity<TelegramPaymentDtos.PaymentRequestResponse> getPaymentRequest(
        @PathVariable String id
    ) {
        TelegramPaymentDtos.PaymentRequestResponse response = proxyService.getPaymentRequest(id);
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Get QR code image")
    @GetMapping("/payment_requests/{id}/qr")
    public ResponseEntity<Resource> getQrCode(@PathVariable String id) {
        Resource qrImage = proxyService.getQrCode(id);
        
        return ResponseEntity.ok()
            .contentType(MediaType.IMAGE_PNG)
            .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
            .body(qrImage);
    }
    
    @Operation(summary = "Cancel payment request")
    @PostMapping("/payment_requests/{id}/cancel")
    public ResponseEntity<TelegramPaymentDtos.PaymentRequestResponse> cancelPaymentRequest(
        @PathVariable String id
    ) {
        TelegramPaymentDtos.PaymentRequestResponse response = proxyService.cancelPaymentRequest(id);
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Refresh payment request (retry)")
    @PostMapping("/payment_requests/{id}/refresh")
    public ResponseEntity<TelegramPaymentDtos.PaymentRequestResponse> refreshPaymentRequest(
        @PathVariable String id
    ) {
        TelegramPaymentDtos.PaymentRequestResponse response = proxyService.refreshPaymentRequest(id);
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Get fallback URL for manual input")
    @GetMapping("/payment_requests/{id}/fallback")
    public ResponseEntity<TelegramPaymentDtos.FallbackResponse> getFallbackUrl(
        @PathVariable String id
    ) {
        TelegramPaymentDtos.FallbackResponse response = proxyService.getFallbackUrl(id);
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Submit manually copied URL")
    @PostMapping("/payment_requests/{id}/manual-url")
    public ResponseEntity<TelegramPaymentDtos.PaymentRequestResponse> submitManualUrl(
        @PathVariable String id,
        @Valid @RequestBody TelegramPaymentDtos.ManualUrlDto request
    ) {
        TelegramPaymentDtos.PaymentRequestResponse response = 
            proxyService.submitManualUrl(id, request.url());
        return ResponseEntity.ok(response);
    }
    
    // ============================================
    // MTProto - Привязка Telegram аккаунта
    // ============================================
    
    @Operation(summary = "Send verification code to phone")
    @PostMapping("/telegram/mtproto/sendCode")
    public ResponseEntity<TelegramPaymentDtos.SendCodeResponse> sendCode(
        @Valid @RequestBody TelegramPaymentDtos.SendCodeDto request
    ) {
        TelegramPaymentDtos.SendCodeResponse response = proxyService.sendCode(request.phone());
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Confirm verification code")
    @PostMapping("/telegram/mtproto/confirmCode")
    public ResponseEntity<TelegramPaymentDtos.ConfirmCodeResponse> confirmCode(
        @Valid @RequestBody TelegramPaymentDtos.ConfirmCodeDto request
    ) {
        TelegramPaymentDtos.ConfirmCodeResponse response = 
            proxyService.confirmCode(request.phone(), request.phoneCodeHash(), request.code());
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Confirm 2FA password")
    @PostMapping("/telegram/mtproto/confirmPassword")
    public ResponseEntity<TelegramPaymentDtos.ConfirmPasswordResponse> confirmPassword(
        @Valid @RequestBody TelegramPaymentDtos.ConfirmPasswordDto request
    ) {
        TelegramPaymentDtos.ConfirmPasswordResponse response = 
            proxyService.confirmPassword(request.phone(), request.password());
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Get Telegram link status")
    @GetMapping("/telegram/status")
    public ResponseEntity<TelegramPaymentDtos.TelegramStatusResponse> getTelegramStatus() {
        TelegramPaymentDtos.TelegramStatusResponse response = proxyService.getTelegramStatus();
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Get Telegram settings")
    @GetMapping("/telegram/settings")
    public ResponseEntity<TelegramPaymentDtos.SettingsResponse> getSettings() {
        TelegramPaymentDtos.SettingsResponse response = proxyService.getSettings();
        return ResponseEntity.ok(response);
    }
    
    @Operation(summary = "Update Telegram settings (bank bot username)")
    @PostMapping("/telegram/settings")
    public ResponseEntity<TelegramPaymentDtos.SettingsResponse> updateSettings(
        @Valid @RequestBody TelegramPaymentDtos.UpdateSettingsDto request
    ) {
        TelegramPaymentDtos.SettingsResponse response = 
            proxyService.updateSettings(request.bankBotUsername());
        return ResponseEntity.ok(response);
    }
}
