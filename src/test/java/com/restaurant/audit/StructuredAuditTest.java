package com.restaurant.audit;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;

class StructuredAuditTest {

    @Test
    void recordDoesNotThrow() {
        assertThatCode(() -> StructuredAudit.success("TEST_ACTION",
                Map.of("entityType", "X", "entityId", 1L))).doesNotThrowAnyException();
    }
}
