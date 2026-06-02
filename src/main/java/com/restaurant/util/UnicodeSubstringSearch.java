package com.restaurant.util;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Substring search that is case-insensitive for Unicode letters (including Cyrillic).
 * PostgreSQL {@code ILIKE} with POSIX/C collation only ignores case for ASCII, so we keep a
 * normalized key column and compare with LIKE + ESCAPE.
 */
public final class UnicodeSubstringSearch {

    private UnicodeSubstringSearch() {}

    /**
     * NFC + {@link Locale#ROOT} lowercase — stable case folding for multilingual text.
     */
    public static String normalizeSearchKey(String raw) {
        if (raw == null) {
            throw new NullPointerException("raw");
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        return Normalizer.normalize(trimmed, Normalizer.Form.NFC).toLowerCase(Locale.ROOT);
    }

    /**
     * Builds a {@code LIKE} pattern using {@link #normalizeSearchKey} for the substring.
     * Returns {@code null} when {@code rawQuery} is null or blank (meaning "no filter").
     * ESCAPE {@code '!'}: {@code %} and {@code _} are escaped; {@code !} doubled.
     */
    public static String sqlLikeSubstringPattern(String rawQuery) {
        if (rawQuery == null) {
            return null;
        }
        String nk = normalizeSearchKey(rawQuery);
        if (nk.isEmpty()) {
            return null;
        }
        String escaped = nk.replace("!", "!!").replace("%", "!%").replace("_", "!_");
        return "%" + escaped + "%";
    }
}
