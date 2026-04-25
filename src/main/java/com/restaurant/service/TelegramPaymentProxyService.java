package com.restaurant.service;

import com.restaurant.dto.OrderDto;
import com.restaurant.dto.TelegramPaymentDtos;
import com.restaurant.model.Booking;
import com.restaurant.security.JwtTokenProvider;
import com.restaurant.security.SecurityUtils;
import com.restaurant.util.LogSanitizer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TelegramPaymentProxyService {
    
    private final RestTemplate restTemplate;
    private final JwtTokenProvider jwtTokenProvider;
    private final OrderService orderService;
    private final BookingService bookingService;
    
    @Value("${telegram.payment.service.url:http://localhost:3001}")
    private String telegramPaymentServiceUrl;
    
    /**
     * Генерирует JWT токен для NestJS сервиса на основе текущего пользователя
     */
    private String generateNestJwtToken() {
        var user = SecurityUtils.getCurrentUser();
        if (user == null) {
            log.error("Cannot generate JWT token: user not authenticated");
            throw new IllegalStateException("User not authenticated");
        }
        
        // Генерируем токен с теми же данными, что и основной токен
        String token = jwtTokenProvider.generateAccessToken(
            user.getId(),
            user.getUsername(),
            user.getRole().name(),
            user.getRestaurantId(),
            user.getLocationId()
        );
        
        log.info("✅ Generated JWT token for user: {} (userId: {}, role: {}, restaurantId: {})", 
            user.getUsername(), user.getId(), user.getRole(), user.getRestaurantId());
        log.debug("Generated service JWT state: {}", LogSanitizer.tokenState(token));
        
        return token;
    }
    
    /**
     * Создает HTTP headers с JWT токеном
     */
    private HttpHeaders createHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        String token = generateNestJwtToken();
        String authHeader = "Bearer " + token;
        headers.set("Authorization", authHeader);
        
        return headers;
    }
    
    /**
     * Проксирует POST запрос
     */
    private <T> ResponseEntity<T> proxyPost(String path, Object body, Class<T> responseType) {
        String url = telegramPaymentServiceUrl + path;
        HttpHeaders headers = createHeaders();
        HttpEntity<Object> entity = new HttpEntity<>(body, headers);
        
        log.debug("Proxying POST to: {}", url);
        try {
            return restTemplate.exchange(url, HttpMethod.POST, entity, responseType);
        } catch (org.springframework.web.client.HttpClientErrorException.Unauthorized e) {
            log.error("401 Unauthorized from NestJS service. URL: {}, Response: {}", url, e.getResponseBodyAsString());
            throw e;
        } catch (Exception e) {
            log.error("Error proxying POST to {}: {}", url, e.getMessage(), e);
            throw e;
        }
    }
    
    /**
     * Проксирует GET запрос
     */
    private <T> ResponseEntity<T> proxyGet(String path, Class<T> responseType) {
        String url = telegramPaymentServiceUrl + path;
        HttpHeaders headers = createHeaders();
        HttpEntity<Void> entity = new HttpEntity<>(headers);
        
        log.debug("Proxying GET to: {}", url);
        try {
            return restTemplate.exchange(url, HttpMethod.GET, entity, responseType);
        } catch (org.springframework.web.client.HttpClientErrorException.Unauthorized e) {
            log.error("401 Unauthorized from NestJS service. URL: {}, Response: {}", url, e.getResponseBodyAsString());
            throw e;
        } catch (Exception e) {
            log.error("Error proxying GET to {}: {}", url, e.getMessage(), e);
            throw e;
        }
    }
    
    /**
     * Проксирует GET запрос для бинарных данных (например, QR код)
     */
    private ResponseEntity<Resource> proxyGetBinary(String path) {
        String url = telegramPaymentServiceUrl + path;
        HttpEntity<Void> entity = new HttpEntity<>(createHeaders());
        
        log.debug("Proxying GET binary to: {}", url);
        return restTemplate.exchange(url, HttpMethod.GET, entity, Resource.class);
    }
    
    // ============================================
    // Payment Requests
    // ============================================
    
    public TelegramPaymentDtos.PaymentRequestResponse createPaymentRequest(TelegramPaymentDtos.CreatePaymentRequestDto dto) {
        String invoiceId = dto.invoiceId();
        if (invoiceId == null || invoiceId.isEmpty()) {
            throw new IllegalArgumentException("invoiceId cannot be empty");
        }
        
        double totalAmount;
        String orderNumber;
        
        if (dto.amount() != null && dto.amount() >= 0) {
            totalAmount = dto.amount();
            orderNumber = dto.orderNumber() != null && !dto.orderNumber().isEmpty() ? dto.orderNumber() : invoiceId;
            log.debug("Creating payment request with custom amount {} and label {}", totalAmount, orderNumber);
        } else if (invoiceId.startsWith("bookings_")) {
            List<Long> bookingIds = parseBookingIds(invoiceId);
            BigDecimal sum = BigDecimal.ZERO;
            for (Long bid : bookingIds) {
                Booking booking = bookingService.getBookingById(bid);
                if (booking.getTotalAmount() != null) {
                    sum = sum.add(booking.getTotalAmount());
                }
            }
            totalAmount = sum.setScale(2, RoundingMode.HALF_UP).doubleValue();
            orderNumber = "BK-" + bookingIds.stream().map(String::valueOf).collect(Collectors.joining(","));
            log.debug("Creating payment request for bookings {} with total amount {}", bookingIds, totalAmount);
        } else {
            Long orderId = parseOrderIdFromInvoiceId(invoiceId);
            OrderDto order = orderService.getOrderById(orderId);
            totalAmount = order.totalAmount() != null
                ? order.totalAmount().setScale(2, RoundingMode.HALF_UP).doubleValue() : 0.0;
            orderNumber = String.valueOf(order.id());
            log.debug("Creating payment request for order {} with amount {}", order.id(), order.totalAmount());
        }
        
        TelegramPaymentDtos.CreatePaymentRequestDto request = 
            new TelegramPaymentDtos.CreatePaymentRequestDto(
                invoiceId,
                totalAmount,
                dto.currency() != null ? dto.currency() : "RUB",
                orderNumber
            );
        
        ResponseEntity<TelegramPaymentDtos.PaymentRequestResponse> response = 
            proxyPost("/payment_requests", request, TelegramPaymentDtos.PaymentRequestResponse.class);
        
        return response.getBody();
    }
    
    /**
     * Парсит список booking IDs из invoiceId
     * Формат: "bookings_15,16,17"
     */
    private List<Long> parseBookingIds(String invoiceId) {
        String idsPart = invoiceId.substring("bookings_".length());
        try {
            return Arrays.stream(idsPart.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Long::parseLong)
                .collect(Collectors.toList());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Cannot parse booking IDs from invoiceId: " + invoiceId, e);
        }
    }
    
    /**
     * Парсит order ID из invoiceId.
     * Поддерживает форматы: "order_127", "order-127", "127", "order_6575_pay_0" (раздел счёта — берём только order id).
     */
    private Long parseOrderIdFromInvoiceId(String invoiceId) {
        String numberPart = invoiceId.replaceAll("^order[_-]?", "").trim();
        if (numberPart.contains("_pay_")) {
            numberPart = numberPart.substring(0, numberPart.indexOf("_pay_"));
        }
        try {
            return Long.parseLong(numberPart.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Cannot parse order ID from invoiceId: " + invoiceId, e);
        }
    }
    
    public TelegramPaymentDtos.PaymentRequestResponse getPaymentRequest(String id) {
        ResponseEntity<TelegramPaymentDtos.PaymentRequestResponse> response = 
            proxyGet("/payment_requests/" + id, TelegramPaymentDtos.PaymentRequestResponse.class);
        
        return response.getBody();
    }
    
    public Resource getQrCode(String id) {
        ResponseEntity<Resource> response = proxyGetBinary("/payment_requests/" + id + "/qr");
        return response.getBody();
    }
    
    public TelegramPaymentDtos.PaymentRequestResponse cancelPaymentRequest(String id) {
        ResponseEntity<TelegramPaymentDtos.PaymentRequestResponse> response = 
            proxyPost("/payment_requests/" + id + "/cancel", null, TelegramPaymentDtos.PaymentRequestResponse.class);
        
        return response.getBody();
    }
    
    public TelegramPaymentDtos.PaymentRequestResponse refreshPaymentRequest(String id) {
        ResponseEntity<TelegramPaymentDtos.PaymentRequestResponse> response = 
            proxyPost("/payment_requests/" + id + "/refresh", null, TelegramPaymentDtos.PaymentRequestResponse.class);
        
        return response.getBody();
    }
    
    public TelegramPaymentDtos.FallbackResponse getFallbackUrl(String id) {
        ResponseEntity<TelegramPaymentDtos.FallbackResponse> response = 
            proxyGet("/payment_requests/" + id + "/fallback", TelegramPaymentDtos.FallbackResponse.class);
        
        return response.getBody();
    }
    
    public TelegramPaymentDtos.PaymentRequestResponse submitManualUrl(String id, String url) {
        TelegramPaymentDtos.ManualUrlDto request = new TelegramPaymentDtos.ManualUrlDto(url);
        
        ResponseEntity<TelegramPaymentDtos.PaymentRequestResponse> response = 
            proxyPost("/payment_requests/" + id + "/manual-url", request, TelegramPaymentDtos.PaymentRequestResponse.class);
        
        return response.getBody();
    }
    
    // ============================================
    // MTProto - Привязка Telegram аккаунта
    // ============================================
    
    public TelegramPaymentDtos.SendCodeResponse sendCode(String phone) {
        TelegramPaymentDtos.SendCodeDto request = new TelegramPaymentDtos.SendCodeDto(phone);
        
        ResponseEntity<TelegramPaymentDtos.SendCodeResponse> response = 
            proxyPost("/telegram/mtproto/sendCode", request, TelegramPaymentDtos.SendCodeResponse.class);
        
        return response.getBody();
    }
    
    public TelegramPaymentDtos.ConfirmCodeResponse confirmCode(String phone, String phoneCodeHash, String code) {
        TelegramPaymentDtos.ConfirmCodeDto request = 
            new TelegramPaymentDtos.ConfirmCodeDto(phone, phoneCodeHash, code);
        
        ResponseEntity<TelegramPaymentDtos.ConfirmCodeResponse> response = 
            proxyPost("/telegram/mtproto/confirmCode", request, TelegramPaymentDtos.ConfirmCodeResponse.class);
        
        return response.getBody();
    }
    
    public TelegramPaymentDtos.ConfirmPasswordResponse confirmPassword(String phone, String password) {
        TelegramPaymentDtos.ConfirmPasswordDto request = 
            new TelegramPaymentDtos.ConfirmPasswordDto(phone, password);
        
        ResponseEntity<TelegramPaymentDtos.ConfirmPasswordResponse> response = 
            proxyPost("/telegram/mtproto/confirmPassword", request, TelegramPaymentDtos.ConfirmPasswordResponse.class);
        
        return response.getBody();
    }
    
    public TelegramPaymentDtos.TelegramStatusResponse getTelegramStatus() {
        ResponseEntity<TelegramPaymentDtos.TelegramStatusResponse> response = 
            proxyGet("/telegram/status", TelegramPaymentDtos.TelegramStatusResponse.class);
        
        return response.getBody();
    }
    
    public TelegramPaymentDtos.SettingsResponse getSettings() {
        ResponseEntity<TelegramPaymentDtos.SettingsResponse> response = 
            proxyGet("/telegram/settings", TelegramPaymentDtos.SettingsResponse.class);
        
        return response.getBody();
    }
    
    public TelegramPaymentDtos.SettingsResponse updateSettings(String bankBotUsername) {
        TelegramPaymentDtos.UpdateSettingsDto request = 
            new TelegramPaymentDtos.UpdateSettingsDto(bankBotUsername);
        
        ResponseEntity<TelegramPaymentDtos.SettingsResponse> response = 
            proxyPost("/telegram/settings", request, TelegramPaymentDtos.SettingsResponse.class);
        
        return response.getBody();
    }
}
