package com.restaurant.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Paths;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Обработка загруженных изображений категорий
        // Важно: ResourceHandler обрабатывает только GET запросы
        // POST/PUT/DELETE запросы к /api/** обрабатываются контроллерами
        String categoriesPath = Paths.get("uploads", "categories").toAbsolutePath().toString();
        registry.addResourceHandler("/uploads/categories/**")
            .addResourceLocations("file:" + categoriesPath + "/")
            .setCachePeriod(0)
            .resourceChain(true);
        
        // Обработка загруженных изображений блюд
        // Важно: ResourceHandler обрабатывает только GET запросы
        // POST/PUT/DELETE запросы к /api/** обрабатываются контроллерами
        String dishesPath = Paths.get("uploads", "dishes").toAbsolutePath().toString();
        registry.addResourceHandler("/uploads/dishes/**")
            .addResourceLocations("file:" + dishesPath + "/")
            .setCachePeriod(0)
            .resourceChain(true);

        // Hall assets
        String hallAssetsPath = Paths.get("uploads", "hall", "assets").toAbsolutePath().toString();
        registry.addResourceHandler("/uploads/hall/assets/**")
            .addResourceLocations("file:" + hallAssetsPath + "/")
            .setCachePeriod(0)
            .resourceChain(true);
    }
}

