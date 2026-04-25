package com.restaurant.repository;

import com.restaurant.model.Restaurant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RestaurantRepository extends JpaRepository<Restaurant, Long> {
    boolean existsByNameIgnoreCase(String name);
    List<Restaurant> findByTelegramBotTokenIsNotNull();
}

