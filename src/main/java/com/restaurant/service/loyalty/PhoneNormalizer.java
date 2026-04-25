package com.restaurant.service.loyalty;

import org.springframework.stereotype.Component;

/**
 * Normalizes phone numbers to a consistent format: +7XXXXXXXXXX
 * Strips all non-digit characters, handles 8xxx → +7xxx for Russian phones.
 */
@Component
public class PhoneNormalizer {

    public String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Phone number must not be empty");
        }
        // Strip everything except digits and leading +
        String digits = raw.replaceAll("[^\\d]", "");

        if (digits.length() == 11 && digits.startsWith("8")) {
            digits = "7" + digits.substring(1);
        }
        if (digits.length() == 10) {
            digits = "7" + digits;
        }
        if (digits.length() != 11) {
            throw new IllegalArgumentException("Invalid phone number: " + raw);
        }
        return "+" + digits;
    }
}
