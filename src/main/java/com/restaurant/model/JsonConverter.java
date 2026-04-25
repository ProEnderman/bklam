package com.restaurant.model;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.lang.reflect.Method;
import java.util.Map;

@Converter
public class JsonConverter implements AttributeConverter<Map<String, Object>, Object> {
    
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    @Override
    public Object convertToDatabaseColumn(Map<String, Object> attribute) {
        if (attribute == null) {
            return null;
        }
        try {
            String json = objectMapper.writeValueAsString(attribute);
            
            // Use reflection to create PGobject at runtime
            try {
                Class<?> pgObjectClass = Class.forName("org.postgresql.util.PGobject");
                Object pgObject = pgObjectClass.getDeclaredConstructor().newInstance();
                
                // Set the type to jsonb
                Method setType = pgObjectClass.getMethod("setType", String.class);
                setType.invoke(pgObject, "jsonb");
                
                // Set the value
                Method setValue = pgObjectClass.getMethod("setValue", String.class);
                setValue.invoke(pgObject, json);
                
                return pgObject;
            } catch (ReflectiveOperationException e) {
                // If PGobject is not available, return the JSON string
                // PostgreSQL driver should handle conversion to JSONB
                return json;
            }
        } catch (Exception e) {
            throw new RuntimeException("Error converting map to JSONB", e);
        }
    }
    
    @Override
    public Map<String, Object> convertToEntityAttribute(Object dbData) {
        if (dbData == null) {
            return null;
        }
        try {
            String json;
            
            // Check if dbData is PGobject (using reflection)
            String className = dbData.getClass().getName();
            if (className.equals("org.postgresql.util.PGobject")) {
                Method getValue = dbData.getClass().getMethod("getValue");
                json = (String) getValue.invoke(dbData);
            } else if (dbData instanceof String) {
                json = (String) dbData;
            } else {
                json = dbData.toString();
            }
            
            if (json == null || json.isEmpty()) {
                return null;
            }
            
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new RuntimeException("Error converting JSONB to map", e);
        }
    }
}

