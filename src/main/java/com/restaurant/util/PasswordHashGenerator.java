package com.restaurant.util;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * Утилита для генерации bcrypt хешей паролей.
 * Запустите main метод, чтобы получить хеши для миграций.
 */
public class PasswordHashGenerator {
    
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        
        System.out.println("=== Генерация bcrypt хешей ===");
        System.out.println();
        
        String admin123 = encoder.encode("admin123");
        System.out.println("Пароль: admin123");
        System.out.println("Хеш: " + admin123);
        System.out.println();
        
        String worker123 = encoder.encode("worker123");
        System.out.println("Пароль: worker123");
        System.out.println("Хеш: " + worker123);
        System.out.println();
        
        if (args.length > 0) {
            String custom = String.join(" ", args);
            String h = encoder.encode(custom);
            System.out.println("Custom password (length " + custom.length() + "):");
            System.out.println("Хеш: " + h);
            System.out.println("matches: " + encoder.matches(custom, h));
        }
        
        System.out.println("=== Проверка хешей ===");
        System.out.println("admin123 matches: " + encoder.matches("admin123", admin123));
        System.out.println("worker123 matches: " + encoder.matches("worker123", worker123));
    }
}

