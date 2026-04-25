package com.restaurant.exception;

/**
 * Optional contract for exceptions that expose a stable machine-readable {@link ApiErrorResponse#code()}.
 */
public interface HasApiErrorCode {
    String getApiErrorCode();
}
