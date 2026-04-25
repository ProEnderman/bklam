package com.restaurant.exception;

public class ResourceNotFoundException extends RuntimeException implements HasApiErrorCode {

    private final String apiErrorCode;

    public ResourceNotFoundException(String message) {
        this(message, "NOT_FOUND");
    }

    public ResourceNotFoundException(String message, String apiErrorCode) {
        super(message);
        this.apiErrorCode = apiErrorCode;
    }

    @Override
    public String getApiErrorCode() {
        return apiErrorCode;
    }
}
