package com.restaurant.exception;

public class InsufficientStockException extends RuntimeException implements HasApiErrorCode {

    private final String apiErrorCode;

    public InsufficientStockException(String message) {
        this(message, "INSUFFICIENT_STOCK");
    }

    public InsufficientStockException(String message, String apiErrorCode) {
        super(message);
        this.apiErrorCode = apiErrorCode;
    }

    @Override
    public String getApiErrorCode() {
        return apiErrorCode;
    }
}
