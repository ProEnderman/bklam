package com.restaurant.repository;

import com.restaurant.model.BookingOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface BookingOrderRepository extends JpaRepository<BookingOrder, Long> {

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM BookingOrder o WHERE o.branch.id = :branchId AND o.customerName LIKE :prefix")
    int deleteDemoSeedBookingOrders(
        @Param("branchId") Long branchId,
        @Param("prefix") String prefix
    );
}
