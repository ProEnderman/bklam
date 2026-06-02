package com.restaurant.dto;

/**
 * User choice when stock Excel references an unknown ingredient name (unit is known).
 */
public record ResolveIngredientMissingRequest(
    boolean createNew,
    /** Used when {@code createNew}; null or omitted defaults to 0 */
    Double minQty
) {}
