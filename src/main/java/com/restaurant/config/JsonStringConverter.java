package com.restaurant.config;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.postgresql.util.PGobject;

import java.sql.SQLException;

/**
 * Converter for storing String as PostgreSQL JSONB.
 */
@Converter
public class JsonStringConverter implements AttributeConverter<String, Object> {

    @Override
    public Object convertToDatabaseColumn(String attribute) {
        if (attribute == null) {
            return null;
        }
        try {
            PGobject pgObject = new PGobject();
            pgObject.setType("jsonb");
            pgObject.setValue(attribute);
            return pgObject;
        } catch (SQLException e) {
            throw new IllegalArgumentException("Failed to convert to JSONB", e);
        }
    }

    @Override
    public String convertToEntityAttribute(Object dbData) {
        if (dbData == null) {
            return null;
        }
        if (dbData instanceof PGobject) {
            return ((PGobject) dbData).getValue();
        }
        return dbData.toString();
    }
}
