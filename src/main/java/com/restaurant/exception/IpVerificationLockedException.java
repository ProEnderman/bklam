package com.restaurant.exception;

/**
 * Too many wrong email verification codes from the same client; temporary lockout.
 */
public class IpVerificationLockedException extends BusinessException {

    private final int retryAfterSeconds;

    public IpVerificationLockedException(int retryAfterSeconds) {
        super(buildMessage(retryAfterSeconds), "VERIFICATION_IP_LOCKED");
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    private static String buildMessage(int retryAfterSeconds) {
        int minutes = retryAfterSeconds / 60;
        int seconds = retryAfterSeconds % 60;
        if (minutes > 0 && seconds > 0) {
            return String.format(
                    "Слишком много неверных попыток ввода кода из письма. Повторите вход через %d мин. %d сек.",
                    minutes, seconds);
        }
        if (minutes > 0) {
            return String.format(
                    "Слишком много неверных попыток ввода кода из письма. Повторите вход через %d мин.",
                    minutes);
        }
        return String.format(
                "Слишком много неверных попыток ввода кода из письма. Повторите вход через %d сек.",
                retryAfterSeconds);
    }

    public int getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
