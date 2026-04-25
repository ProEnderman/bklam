package com.restaurant.web;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/**
 * Caps list endpoints so a single request cannot pull unbounded rows.
 */
public final class PaginationConstraints {

    public static final int MAX_PAGE_SIZE = 200;

    private PaginationConstraints() {
    }

    public static int clampPageSize(int requested) {
        if (requested < 1) {
            return 1;
        }
        return Math.min(requested, MAX_PAGE_SIZE);
    }

    public static Pageable pageable(int page, int size) {
        return PageRequest.of(page, clampPageSize(size));
    }
}
