package com.restaurant.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.restaurant.util.LogSanitizer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {
    
    private final RestTemplate restTemplate;
    
    @Value("${app.email.smtp2go.api-key:}")
    private String apiKey;
    
    @Value("${app.email.from-address:noreply@restaurant.com}")
    private String fromAddress;
    
    @Value("${app.email.from-name:Restaurant Management System}")
    private String fromName;
    
    private static final String SMTP2GO_API_URL = "https://api.smtp2go.com/v3/email/send";
    
    public void sendVerificationCode(String toEmail, String code) {
        try {
            log.debug("Preparing to send verification code to: {} via SMTP2GO REST API", toEmail);
            log.debug("API Key state: {}", LogSanitizer.secretState(apiKey));
            log.debug("From address: {}", fromAddress);
            
            if (apiKey == null || apiKey.isEmpty() || apiKey.equals("your-smtp2go-api-key")) {
                log.error("SMTP2GO API key is not configured.");
                throw new RuntimeException("SMTP2GO API key is not configured. Please set SMTP2GO_API_KEY environment variable or app.email.smtp2go.api-key property");
            }
            
            // Формируем запрос для SMTP2GO REST API
            Smtp2GoRequest request = new Smtp2GoRequest();
            request.setApiKey(apiKey);
            request.setTo(Collections.singletonList(toEmail));
            request.setSender(fromAddress);
            request.setSubject("Код подтверждения входа");
            request.setTextBody(buildEmailContent(code));
            
            // Настраиваем заголовки
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            
            HttpEntity<Smtp2GoRequest> entity = new HttpEntity<>(request, headers);
            
            log.debug("Sending email via SMTP2GO API from: {} to: {}", fromAddress, toEmail);
            ResponseEntity<Smtp2GoResponse> response = restTemplate.postForEntity(
                SMTP2GO_API_URL, 
                entity, 
                Smtp2GoResponse.class
            );
            
            // Логируем полный ответ для отладки
            log.debug("SMTP2GO API response status: {}", response.getStatusCode());
            if (response.getBody() != null) {
                log.debug("SMTP2GO API response body: error_code={}, error={}", 
                    response.getBody().getErrorCode(), response.getBody().getError());
            }
            
            // Проверяем наличие ошибок в ответе
            if (response.getBody() != null) {
                if (response.getBody().getErrorCode() != null || 
                    (response.getBody().getError() != null && !response.getBody().getError().isEmpty())) {
                    String errorMsg = String.format("SMTP2GO API error: code=%s, error=%s", 
                        response.getBody().getErrorCode(), response.getBody().getError());
                    log.error("{} From: {}, To: {}", errorMsg, fromAddress, toEmail);
                    throw new RuntimeException("Failed to send email via SMTP2GO API: " + errorMsg);
                }
                
                if (response.getBody().getData() != null) {
                    String emailId = response.getBody().getData().getEmailId();
                    if (emailId != null && !emailId.isEmpty()) {
                log.info("Verification code sent successfully to: {} via SMTP2GO. Email ID: {}", 
                            toEmail, emailId);
                    } else {
                        log.warn("SMTP2GO API returned success but email_id is empty. Response: {}", response.getBody());
                    }
                } else {
                    log.warn("SMTP2GO API response data is null for email: {}", toEmail);
                }
            } else {
                log.warn("SMTP2GO API response body is null for email: {}", toEmail);
            }
            
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            log.error("SMTP2GO API error. Status: {}, Response: {}. From: {}, To: {}", 
                e.getStatusCode(), e.getResponseBodyAsString(), fromAddress, toEmail, e);
            throw new RuntimeException("Failed to send email via SMTP2GO API: " + e.getMessage(), e);
        } catch (org.springframework.web.client.ResourceAccessException e) {
            log.error("Network error connecting to SMTP2GO API. From: {}, To: {}", fromAddress, toEmail, e);
            throw new RuntimeException("Failed to connect to SMTP2GO API. Check network connection.", e);
        } catch (Exception e) {
            log.error("Unexpected error sending verification code to: {}", toEmail, e);
            throw new RuntimeException("Failed to send verification code: " + e.getMessage(), e);
        }
    }
    
    private String buildEmailContent(String code) {
        return String.format(
            "Здравствуйте!\n\n" +
            "Ваш код подтверждения для входа в систему: %s\n\n" +
            "Код действителен в течение 10 минут.\n\n" +
            "Если вы не запрашивали этот код, проигнорируйте это письмо.\n\n" +
            "С уважением,\n" +
            "%s",
            code,
            fromName
        );
    }
    
    // DTO для SMTP2GO API запроса
    @Data
    private static class Smtp2GoRequest {
        @JsonProperty("api_key")
        private String apiKey;
        
        @JsonProperty("to")
        private List<String> to;
        
        @JsonProperty("sender")
        private String sender;
        
        @JsonProperty("subject")
        private String subject;
        
        @JsonProperty("text_body")
        private String textBody;
    }
    
    // DTO для SMTP2GO API ответа
    @Data
    private static class Smtp2GoResponse {
        @JsonProperty("data")
        private Smtp2GoData data;
        
        @JsonProperty("error_code")
        private String errorCode;
        
        @JsonProperty("error")
        private String error;
    }
    
    @Data
    private static class Smtp2GoData {
        @JsonProperty("email_id")
        private String emailId;
        
        @JsonProperty("error_code")
        private String errorCode;
        
        @JsonProperty("error")
        private String error;
    }
}

