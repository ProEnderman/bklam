package com.restaurant;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class RestaurantManagementApplicationTests {

    @Test
    void contextLoads() {
        // Проверка, что контекст Spring загружается без ошибок
    }
}

