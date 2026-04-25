package com.restaurant.repository;

import com.restaurant.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);

    /** Load user with restaurant and location for login/principal (avoids N+1). */
    @Query("SELECT u FROM User u LEFT JOIN FETCH u.restaurant LEFT JOIN FETCH u.location WHERE u.username = :username")
    Optional<User> findByUsernameWithLocation(@Param("username") String username);

    boolean existsByUsername(String username);

    /** True if any user is linked to this restaurant. */
    boolean existsByRestaurant_Id(Long restaurantId);

    /** Delete all users linked to this restaurant (e.g. before deleting the restaurant). */
    void deleteByRestaurant_Id(Long restaurantId);

    // Используем restaurant.id вместо restaurantId, так как это отношение @ManyToOne, так как это отношение @ManyToOne
    @EntityGraph(attributePaths = "restaurant")
    Page<User> findByRestaurant_Id(Long restaurantId, Pageable pageable);
}

