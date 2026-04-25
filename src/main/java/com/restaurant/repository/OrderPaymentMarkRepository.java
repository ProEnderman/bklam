package com.restaurant.repository;

import com.restaurant.model.OrderPaymentMark;
import com.restaurant.model.OrderPaymentMarkId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OrderPaymentMarkRepository extends JpaRepository<OrderPaymentMark, OrderPaymentMarkId> {

    List<OrderPaymentMark> findByOrderId(Long orderId);

    List<OrderPaymentMark> findByOrderIdIn(List<Long> orderIds);

    @Modifying
    @Query("DELETE FROM OrderPaymentMark m WHERE m.orderId = :orderId AND m.paymentRequestId = :paymentRequestId")
    void deleteByOrderIdAndPaymentRequestId(@Param("orderId") Long orderId, @Param("paymentRequestId") String paymentRequestId);
}
