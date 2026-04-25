package com.restaurant.service;

import com.restaurant.dto.CreateOrderSplitRequest;
import com.restaurant.dto.OrderSplitDto;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Order;
import com.restaurant.model.OrderItem;
import com.restaurant.model.OrderShare;
import com.restaurant.model.OrderShareItem;
import com.restaurant.model.OrderStatus;
import com.restaurant.model.loyalty.Guest;
import com.restaurant.repository.OrderRepository;
import com.restaurant.repository.OrderShareRepository;
import com.restaurant.repository.loyalty.GuestRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SplitBillService {

    private final OrderRepository orderRepository;
    private final OrderShareRepository orderShareRepository;
    private final GuestRepository guestRepository;

    @Transactional
    public OrderSplitDto createSplit(Long orderId, CreateOrderSplitRequest request) {
        Order order = loadAndAuthorize(orderId);

        // Разрешаем split для OPEN и CLOSED (до подтверждения оплаты официант может исправить)
        if (order.getStatus() != OrderStatus.OPEN && order.getStatus() != OrderStatus.CLOSED) {
            throw new BusinessException("Cannot split order: only OPEN or CLOSED orders can have split");
        }
        if (order.getItems().isEmpty()) {
            throw new BusinessException("Cannot split an order with no items");
        }
        if (orderShareRepository.existsByOrderId(orderId)) {
            throw new SplitConflictException("Split already exists for this order; delete it first");
        }

        initItems(order);

        Map<Long, OrderItem> itemMap = order.getItems().stream()
                .collect(Collectors.toMap(OrderItem::getId, i -> i));

        Map<Long, Integer> assignedQtyByItem = new HashMap<>();
        for (OrderItem oi : order.getItems()) {
            assignedQtyByItem.put(oi.getId(), 0);
        }

        for (CreateOrderSplitRequest.ShareRequest sr : request.shares()) {
            for (CreateOrderSplitRequest.ItemQty iq : sr.itemQtys()) {
                Long itemId = iq.itemId();
                if (!itemMap.containsKey(itemId)) {
                    throw new BusinessException("Item " + itemId + " does not belong to this order");
                }
                int current = assignedQtyByItem.getOrDefault(itemId, 0);
                assignedQtyByItem.put(itemId, current + iq.qty());
            }
        }

        for (OrderItem oi : order.getItems()) {
            int assigned = assignedQtyByItem.get(oi.getId());
            if (assigned != oi.getQty()) {
                throw new BusinessException("Item " + oi.getId() + " (" + oi.getDish().getName() + "): assigned qty " + assigned + " must equal order qty " + oi.getQty());
            }
        }

        List<OrderShare> shares = new ArrayList<>();
        for (CreateOrderSplitRequest.ShareRequest sr : request.shares()) {
            OrderShare share = new OrderShare();
            share.setOrder(order);
            share.setName(sr.name());
            if (sr.guestId() != null) {
                Guest g = guestRepository.findById(sr.guestId())
                    .orElseThrow(() -> new BusinessException("Guest not found: " + sr.guestId()));
                if (!g.getRestaurant().getId().equals(order.getRestaurantId())) {
                    throw new BusinessException("Guest belongs to another restaurant");
                }
                share.setGuest(g);
            }
            shares.add(share);
        }

        try {
            orderShareRepository.saveAll(shares);
            orderShareRepository.flush();
        } catch (DataIntegrityViolationException ex) {
            throw new SplitConflictException("Split conflict: " + ex.getMessage());
        }

        for (int i = 0; i < request.shares().size(); i++) {
            CreateOrderSplitRequest.ShareRequest sr = request.shares().get(i);
            OrderShare share = shares.get(i);
            for (CreateOrderSplitRequest.ItemQty iq : sr.itemQtys()) {
                OrderItem oi = itemMap.get(iq.itemId());
                OrderShareItem si = new OrderShareItem();
                si.setShareId(share.getId());
                si.setOrderItemId(oi.getId());
                si.setShare(share);
                si.setOrderItem(oi);
                si.setQty(iq.qty());
                share.getShareItems().add(si);
            }
            orderShareRepository.save(share);
        }

        log.info("Split created: orderId={} shares={}", orderId, shares.size());
        return buildDto(order, shares);
    }

    @Transactional(readOnly = true)
    public OrderSplitDto getSplit(Long orderId) {
        Order order = loadAndAuthorize(orderId);
        List<OrderShare> shares = orderShareRepository.findByOrderIdWithItems(orderId);
        if (shares.isEmpty()) {
            throw new ResourceNotFoundException("No split found for order " + orderId);
        }
        initItems(order);
        return buildDto(order, shares);
    }

    @Transactional
    public void deleteSplit(Long orderId) {
        loadAndAuthorize(orderId);
        orderShareRepository.deleteByOrderId(orderId);
        log.info("Split deleted: orderId={}", orderId);
    }

    // ── internal ──

    private Order loadAndAuthorize(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));

        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId != null && !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        return order;
    }

    private void initItems(Order order) {
        order.getItems().size();
        for (OrderItem item : order.getItems()) {
            item.getDish().getName();
        }
    }

    private OrderSplitDto buildDto(Order order, List<OrderShare> shares) {
        List<OrderSplitDto.ShareDto> shareDtos = shares.stream().map(s -> {
            List<OrderSplitDto.SplitItemDto> itemDtos = s.getShareItems().stream().map(si -> {
                OrderItem i = si.getOrderItem();
                BigDecimal unitPrice = i.getQty() != null && i.getQty() > 0 && i.getLineTotal() != null
                    ? i.getLineTotal().divide(BigDecimal.valueOf(i.getQty()), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
                BigDecimal lineTotal = unitPrice.multiply(BigDecimal.valueOf(si.getQty())).setScale(2, RoundingMode.HALF_UP);
                return new OrderSplitDto.SplitItemDto(
                    i.getId(),
                    i.getDish().getId(),
                    i.getDish().getName(),
                    si.getQty(),
                    lineTotal
                );
            }).toList();
            BigDecimal shareTotal = itemDtos.stream()
                    .map(OrderSplitDto.SplitItemDto::lineTotal)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            Guest g = s.getGuest();
            Long guestId = g != null ? g.getId() : null;
            String guestLabel = null;
            if (g != null) {
                if (g.getName() != null && !g.getName().isBlank()) {
                    guestLabel = g.getPhoneNormalized() != null && !g.getPhoneNormalized().isBlank()
                        ? g.getName() + " — " + g.getPhoneNormalized()
                        : g.getName();
                } else {
                    guestLabel = g.getPhoneNormalized();
                }
            }
            return new OrderSplitDto.ShareDto(s.getId(), s.getName(), shareTotal, itemDtos, guestId, guestLabel);
        }).toList();

        BigDecimal orderTotal = order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO;
        return new OrderSplitDto(order.getId(), orderTotal, shareDtos);
    }

    public static class SplitConflictException extends RuntimeException implements com.restaurant.exception.HasApiErrorCode {
        private final String apiErrorCode;

        public SplitConflictException(String message) {
            this(message, "SPLIT_CONFLICT");
        }

        public SplitConflictException(String message, String apiErrorCode) {
            super(message);
            this.apiErrorCode = apiErrorCode;
        }

        @Override
        public String getApiErrorCode() {
            return apiErrorCode;
        }
    }
}
