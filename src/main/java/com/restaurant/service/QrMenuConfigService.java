package com.restaurant.service;

import com.restaurant.dto.QrMenuConfigDto;
import com.restaurant.dto.UpdateQrMenuExpiryRequest;
import com.restaurant.model.Restaurant;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.security.QrSigningUtil;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class QrMenuConfigService {

    private static final long TABLE_ID_FOR_QR = 0L;

    private final RestaurantRepository restaurantRepository;
    private final QrSigningUtil qrSigningUtil;

    @Value("${qr.menu.base-url:http://localhost:3000}")
    private String baseUrl;

    @Value("${qr.menu.default-ttl-days:365}")
    private long defaultTtlDays;

    @Transactional(readOnly = false)
    public QrMenuConfigDto getConfig() {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new IllegalStateException("Restaurant context required");
        }
        Restaurant restaurant = restaurantRepository.findById(restaurantId)
                .orElseThrow(() -> new IllegalArgumentException("Restaurant not found"));
        LocalDateTime expiresAt = restaurant.getQrTokenExpiresAt();
        if (expiresAt == null) {
            expiresAt = LocalDateTime.now().plusDays(defaultTtlDays);
            restaurant.setQrTokenExpiresAt(expiresAt);
            restaurantRepository.save(restaurant);
            log.info("QR menu: set default expiry for restaurant {} to {}", restaurantId, expiresAt);
        }
        String token = qrSigningUtil.sign(restaurantId, TABLE_ID_FOR_QR, expiresAt);
        String menuQrUrl = baseUrl.replaceAll("/$", "") + "/qr?token=" + token;
        boolean expired = expiresAt.isBefore(LocalDateTime.now());
        return new QrMenuConfigDto(menuQrUrl, expiresAt, expired);
    }

    @Transactional
    public QrMenuConfigDto updateExpiry(UpdateQrMenuExpiryRequest request) {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new IllegalStateException("Restaurant context required");
        }
        Restaurant restaurant = restaurantRepository.findById(restaurantId)
                .orElseThrow(() -> new IllegalArgumentException("Restaurant not found"));
        restaurant.setQrTokenExpiresAt(request.expiresAt());
        restaurantRepository.save(restaurant);
        log.info("QR menu expiry updated for restaurant {} to {}", restaurantId, request.expiresAt());
        return getConfig();
    }
}
