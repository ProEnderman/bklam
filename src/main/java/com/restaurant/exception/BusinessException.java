package com.restaurant.exception;

public class BusinessException extends RuntimeException implements HasApiErrorCode {

    private final String apiErrorCode;

    public BusinessException(String message) {
        this(message, "BUSINESS_RULE_VIOLATION");
    }

    public BusinessException(String message, String apiErrorCode) {
        super(message);
        this.apiErrorCode = apiErrorCode;
    }

    @Override
    public String getApiErrorCode() {
        return apiErrorCode;
    }
}
