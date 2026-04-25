package com.restaurant.repository;

import com.restaurant.model.BookingOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BookingOrderRepository extends JpaRepository<BookingOrder, Long> {
}
