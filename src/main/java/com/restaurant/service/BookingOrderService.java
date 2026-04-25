package com.restaurant.service;

import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Booking;
import com.restaurant.model.BookingOrder;
import com.restaurant.model.Restaurant;
import com.restaurant.repository.BookingOrderRepository;
import com.restaurant.repository.BookingRepository;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.security.SecurityUtils;
import com.restaurant.util.TimeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Заказы по бронированиям. Удаление заказа не отменяет бронирования — у них обнуляется ссылка на заказ.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BookingOrderService {

    private final BookingOrderRepository bookingOrderRepository;
    private final BookingRepository bookingRepository;
    private final RestaurantRepository restaurantRepository;
    private final BookingService bookingService;

    @Transactional
    public BookingOrder create(Long branchId, String customerName, String customerPhone) {
        Long currentBranch = SecurityUtils.getCurrentRestaurantId();
        if (currentBranch == null || !currentBranch.equals(branchId)) {
            throw new BusinessException("Access denied to this branch");
        }
        Restaurant branch = restaurantRepository.findById(branchId)
            .orElseThrow(() -> new ResourceNotFoundException("Branch not found"));
        BookingOrder order = new BookingOrder();
        order.setBranch(branch);
        order.setCustomerName(customerName);
        order.setCustomerPhone(customerPhone);
        order.setCreatedAt(TimeUtils.now());
        order.setCreatedBy(SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system");
        return bookingOrderRepository.save(order);
    }

    /**
     * Удалить заказ бронирований.
     * @param cancelBookings true — сначала отменить все брони заказа, затем удалить заказ; false — только удалить заказ (брони остаются, ссылка обнуляется).
     */
    @Transactional
    public void delete(Long bookingOrderId, boolean cancelBookings) {
        BookingOrder order = bookingOrderRepository.findById(bookingOrderId)
            .orElseThrow(() -> new ResourceNotFoundException("Booking order not found"));
        Long currentBranch = SecurityUtils.getCurrentRestaurantId();
        if (currentBranch == null || !currentBranch.equals(order.getBranchId())) {
            throw new BusinessException("Access denied to this order");
        }
        if (cancelBookings) {
            List<Booking> linked = bookingRepository.findByBookingOrder_Id(bookingOrderId);
            for (Booking b : linked) {
                if (b.getStatus() != Booking.BookingStatus.CANCELLED) {
                    bookingService.cancelBooking(b.getId());
                }
            }
            log.info("Booking order deleted with {} bookings cancelled: id={}", linked.size(), bookingOrderId);
        }
        bookingOrderRepository.delete(order);
        if (!cancelBookings) {
            log.info("Booking order deleted: id={}, branchId={}. Bookings remain, link set to null.", bookingOrderId, order.getBranchId());
        }
    }

    /**
     * «Распустить» группу без заказа.
     * @param cancelBookings true — отменить все брони этой группы; false — только отвязать от заказа (создать временный заказ, привязать, удалить).
     */
    @Transactional
    public void dissolveGroup(Long branchId, String customerName, String customerPhone, boolean cancelBookings) {
        Long currentBranch = SecurityUtils.getCurrentRestaurantId();
        if (currentBranch == null || !currentBranch.equals(branchId)) {
            throw new BusinessException("Access denied to this branch");
        }
        String name = customerName != null ? customerName.trim() : "";
        String phone = customerPhone != null ? customerPhone.trim() : "";
        List<Booking> bookings = bookingRepository.findByBranchAndCustomer(branchId, name, phone, Booking.BookingStatus.CANCELLED);
        if (cancelBookings) {
            for (Booking b : bookings) {
                if (b.getStatus() != Booking.BookingStatus.CANCELLED) {
                    bookingService.cancelBooking(b.getId());
                }
            }
            log.info("Dissolved and cancelled {} bookings: branchId={}, customer={}/{}", bookings.size(), branchId, customerName, customerPhone);
            return;
        }
        Restaurant branch = restaurantRepository.findById(branchId)
            .orElseThrow(() -> new ResourceNotFoundException("Branch not found"));
        BookingOrder temp = new BookingOrder();
        temp.setBranch(branch);
        temp.setCustomerName(customerName);
        temp.setCustomerPhone(customerPhone);
        temp.setCreatedAt(TimeUtils.now());
        temp.setCreatedBy(SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system");
        temp = bookingOrderRepository.save(temp);
        for (Booking b : bookings) {
            b.setBookingOrder(temp);
            bookingRepository.save(b);
        }
        bookingOrderRepository.delete(temp);
        log.info("Dissolved booking group: branchId={}, customer={}/{}, {} bookings unlinked from order", branchId, customerName, customerPhone, bookings.size());
    }
}
