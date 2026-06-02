package com.restaurant.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UnicodeSubstringSearchTest {

    @Test
    void normalizeRussianCaseFoldsMixedCasePrefix() {
        String full = UnicodeSubstringSearch.normalizeSearchKey("Кокосовое молоко");
        String needle = UnicodeSubstringSearch.normalizeSearchKey("КОко");
        assertEquals("кокосовое молоко", full);
        assertEquals("коко", needle);
        assertTrue(full.contains(needle));
    }

    @Test
    void sqlLikePatternNullForBlank() {
        assertNull(UnicodeSubstringSearch.sqlLikeSubstringPattern(null));
        assertNull(UnicodeSubstringSearch.sqlLikeSubstringPattern(""));
        assertNull(UnicodeSubstringSearch.sqlLikeSubstringPattern("  "));
    }
}
