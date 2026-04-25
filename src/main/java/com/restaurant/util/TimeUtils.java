package com.restaurant.util;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * Утилита для «виртуального» времени в dev/test.
 * <p>
 * Смещение задаётся только на время обработки одного HTTP-запроса (см. {@link com.restaurant.config.TimeOverrideFilter}
 * и заголовок {@code X-Time-Offset-Ms}). Глобального состояния между запросами и потоками нет.
 */
public final class TimeUtils {

    private static final ThreadLocal<Long> REQUEST_OFFSET_MS = new ThreadLocal<>();

    private TimeUtils() {}

    /**
     * Установить смещение для текущего потока (обычно фильтр; обязательно {@link #clearRequestBinding()} в finally).
     */
    public static void bindRequestOffsetMs(long offsetMs) {
        REQUEST_OFFSET_MS.set(offsetMs);
    }

    /**
     * Снять привязку смещения с текущего потока (после обработки запроса).
     */
    public static void clearRequestBinding() {
        REQUEST_OFFSET_MS.remove();
    }

    /** Текущее «виртуальное» время для этого запроса */
    public static LocalDateTime now() {
        Long off = REQUEST_OFFSET_MS.get();
        long offset = off == null ? 0L : off;
        if (offset == 0) {
            return LocalDateTime.now();
        }
        return LocalDateTime.now().plusNanos(offset * 1_000_000L);
    }

    /** «Виртуальная» дата */
    public static LocalDate today() {
        return now().toLocalDate();
    }

    /** «Виртуальное» время суток */
    public static LocalTime timeNow() {
        return now().toLocalTime();
    }

    /** Смещение текущего запроса (0 если не задано) */
    public static long getCurrentRequestOffsetMs() {
        Long o = REQUEST_OFFSET_MS.get();
        return o == null ? 0L : o;
    }

    /** Подмена активна в рамках текущего запроса? */
    public static boolean isRequestOverridden() {
        Long o = REQUEST_OFFSET_MS.get();
        return o != null && o != 0;
    }
}
