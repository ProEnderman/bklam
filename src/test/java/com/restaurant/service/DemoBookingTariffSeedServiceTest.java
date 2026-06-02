package com.restaurant.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DemoBookingTariffSeedServiceTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void timeBasedPricingFormulaJson_isValid() throws Exception {
    String json = DemoBookingTariffSeedService.serializeTimeBasedFormula(
        interval("12:00", "18:00", 2000),
        interval("18:00", "22:00", 2800)
    );
    JsonNode root = objectMapper.readTree(json);
    assertEquals("TIME_BASED", root.get("model").asText());
    assertTrue(root.get("intervals").isArray());
    assertEquals(2, root.get("intervals").size());
    assertEquals("12:00", root.get("intervals").get(0).get("timeFrom").asText());
    assertEquals(2000, root.get("intervals").get(0).get("rate").asInt());
  }

  private static java.util.Map<String, Object> interval(String from, String to, int rate) {
    java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
    m.put("timeFrom", from);
    m.put("timeTo", to);
    m.put("rate", rate);
    return m;
  }
}
