package com.restaurant.model;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.ArrayList;
import java.util.List;

@Converter
public class UserPermissionListConverter implements AttributeConverter<List<UserPermission>, String> {
    
    private static final ObjectMapper objectMapper = new ObjectMapper();
    
    @Override
    public String convertToDatabaseColumn(List<UserPermission> permissions) {
        if (permissions == null || permissions.isEmpty()) {
            return null;
        }
        try {
            List<String> permissionNames = permissions.stream()
                .map(Enum::name)
                .toList();
            return objectMapper.writeValueAsString(permissionNames);
        } catch (Exception e) {
            throw new RuntimeException("Error converting permissions to JSON", e);
        }
    }
    
    @Override
    public List<UserPermission> convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.trim().isEmpty()) {
            return new ArrayList<>();
        }
        try {
            List<String> permissionNames = objectMapper.readValue(dbData, new TypeReference<List<String>>() {});
            List<UserPermission> permissions = new ArrayList<>();
            for (String name : permissionNames) {
                try {
                    permissions.add(UserPermission.valueOf(name));
                } catch (IllegalArgumentException e) {
                    // Игнорируем неизвестные права
                }
            }
            return permissions;
        } catch (Exception e) {
            throw new RuntimeException("Error converting JSON to permissions", e);
        }
    }
}


