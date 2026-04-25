package com.restaurant.audit;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Single-line JSON audit events to SLF4J (logger {@code com.restaurant.audit.event}).
 * Does not persist to DB; complements {@link com.restaurant.service.ActivityLogService}.
 */
public final class StructuredAudit {

    public static final String CHANNEL_POS = "POS";
    public static final String CHANNEL_QR = "QR";
    public static final String CHANNEL_TELEGRAM = "TELEGRAM";

    private static final Logger AUDIT = LoggerFactory.getLogger("com.restaurant.audit.event");

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .setSerializationInclusion(JsonInclude.Include.NON_NULL);

    private StructuredAudit() {}

    public enum Result {
        SUCCESS,
        FAILURE
    }

    public static void record(String action, Result result, Map<String, Object> fields) {
        if (!AUDIT.isInfoEnabled()) {
            return;
        }
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("timestamp", Instant.now().toString());
        payload.put("action", action);
        payload.put("result", result.name());
        if (fields != null) {
            for (Map.Entry<String, Object> e : fields.entrySet()) {
                if (e.getKey() == null || e.getValue() == null) {
                    continue;
                }
                payload.put(e.getKey(), sanitize(e.getValue()));
            }
        }
        try {
            AUDIT.info("{}", MAPPER.writeValueAsString(payload));
        } catch (JsonProcessingException ex) {
            AUDIT.warn("audit_json_failed: {}", ex.getMessage());
        }
    }

    public static void success(String action, Map<String, Object> fields) {
        record(action, Result.SUCCESS, fields);
    }

    public static void failure(String action, Map<String, Object> fields) {
        record(action, Result.FAILURE, fields);
    }

    private static Object sanitize(Object v) {
        if (v instanceof String s) {
            String t = s.trim();
            if (t.length() > 512) {
                return t.substring(0, 512) + "...";
            }
            return t;
        }
        return v;
    }
}
