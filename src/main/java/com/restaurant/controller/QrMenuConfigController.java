package com.restaurant.controller;

import com.restaurant.dto.QrMenuConfigDto;
import com.restaurant.dto.UpdateQrMenuExpiryRequest;
import com.restaurant.service.QrMenuConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "QR Menu Config", description = "Настройка QR-меню ресторана: ссылка, срок действия")
@RestController
@RequestMapping("/api/qr-menu")
@RequiredArgsConstructor
public class QrMenuConfigController {

    private final QrMenuConfigService qrMenuConfigService;

    @Operation(summary = "Получить ссылку на QR-меню и срок действия токена")
    @GetMapping("/config")
    public ResponseEntity<QrMenuConfigDto> getConfig() {
        return ResponseEntity.ok(qrMenuConfigService.getConfig());
    }

    @Operation(summary = "Установить срок действия QR-токена")
    @PatchMapping("/config/expiry")
    public ResponseEntity<QrMenuConfigDto> updateExpiry(@Valid @RequestBody UpdateQrMenuExpiryRequest request) {
        return ResponseEntity.ok(qrMenuConfigService.updateExpiry(request));
    }
}
