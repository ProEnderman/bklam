package com.restaurant.service;

import com.restaurant.audit.AuditActions;
import com.restaurant.audit.StructuredAudit;
import com.restaurant.dto.AddPublicItemRequest;
import com.restaurant.dto.OrderDto;
import com.restaurant.dto.PublicMenuCategoryDto;
import com.restaurant.exception.BusinessException;
import com.restaurant.model.OrderItemOption;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.*;
import com.restaurant.observability.BusinessMetrics;
import com.restaurant.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class TelegramOrderingService {

    private final BusinessMetrics businessMetrics;
    private final TelegramSessionRepository telegramSessionRepository;
    private final OrderRepository orderRepository;
    private final DishRepository dishRepository;
    private final RestaurantRepository restaurantRepository;
    private final PublicOrderingService publicOrderingService;
    private final OrderStockCheckService orderStockCheckService;

    @Value("${telegram.defaultRestaurantId:0}")
    private long defaultRestaurantId;

    // ── Session resolution ──

    @Transactional
    public TelegramSession resolveSession(Long telegramUserId, Long requestedRestaurantId) {
        if (telegramUserId == null) {
            throw new BusinessException("telegramUserId is required");
        }

        TelegramSession session = telegramSessionRepository.findByTelegramUserId(telegramUserId)
                .orElse(null);

        Long restaurantId = requestedRestaurantId != null && requestedRestaurantId > 0
                ? requestedRestaurantId
                : (defaultRestaurantId > 0 ? defaultRestaurantId : null);

        // Fallback: if no explicit/default restaurant, keep previously bound session restaurant.
        if (restaurantId == null && session != null && session.getRestaurantId() != null && session.getRestaurantId() > 0) {
            restaurantId = session.getRestaurantId();
        }

        if (restaurantId == null) {
            List<Restaurant> withToken = getRestaurantsWithTelegramBotToken();
            if (withToken.size() == 1) {
                restaurantId = withToken.get(0).getId();
            }
        }

        if (restaurantId == null) {
            throw new BusinessException("restaurantId is required (no default configured)");
        }

        if (!restaurantRepository.existsById(restaurantId)) {
            throw new ResourceNotFoundException("Restaurant not found: " + restaurantId);
        }

        if (session == null) {
            session = new TelegramSession();
            session.setTelegramUserId(telegramUserId);
            session.setRestaurantId(restaurantId);
            session = telegramSessionRepository.save(session);
            log.info("Created telegram session: userId={} restaurantId={}", telegramUserId, restaurantId);
        } else if (!session.getRestaurantId().equals(restaurantId)) {
            session.setRestaurantId(restaurantId);
            session.setLastOrderId(null);
            session = telegramSessionRepository.save(session);
            log.info("Updated telegram session restaurant: userId={} restaurantId={}", telegramUserId, restaurantId);
        }

        return session;
    }

    // ── Menu (delegates to PublicOrderingService) ──

    @Transactional(readOnly = true)
    public List<PublicMenuCategoryDto> getMenu(Long restaurantId) {
        return publicOrderingService.getMenu(restaurantId);
    }

    public PublicOrderingService.MenuVersion computeMenuVersion(Long restaurantId) {
        return publicOrderingService.computeMenuVersion(restaurantId);
    }

    @Transactional(readOnly = true)
    public Optional<String> getRestaurantName(Long restaurantId) {
        if (restaurantId == null) return Optional.empty();
        return restaurantRepository.findById(restaurantId).map(Restaurant::getName);
    }

    @Transactional(readOnly = true)
    public Optional<String> getRestaurantTelegramBotToken(Long restaurantId) {
        if (restaurantId == null) return Optional.empty();
        return restaurantRepository.findById(restaurantId)
                .map(Restaurant::getTelegramBotToken)
                .filter(token -> token != null && !token.isBlank());
    }

    @Transactional(readOnly = true)
    public List<Restaurant> getRestaurantsWithTelegramBotToken() {
        return restaurantRepository.findByTelegramBotTokenIsNotNull().stream()
                .filter(r -> r.getTelegramBotToken() != null && !r.getTelegramBotToken().isBlank())
                .toList();
    }

    @Transactional(readOnly = true)
    public Optional<Long> findRestaurantIdByTelegramUserId(Long telegramUserId) {
        if (telegramUserId == null) return Optional.empty();
        return telegramSessionRepository.findByTelegramUserId(telegramUserId)
                .map(TelegramSession::getRestaurantId);
    }

    public Long resolveRestaurantId(Long requestedId) {
        Long id = requestedId != null && requestedId > 0
                ? requestedId
                : (defaultRestaurantId > 0 ? defaultRestaurantId : null);
        if (id == null) {
            throw new BusinessException("restaurantId is required (no default configured)");
        }
        if (!restaurantRepository.existsById(id)) {
            throw new ResourceNotFoundException("Restaurant not found: " + id);
        }
        return id;
    }

    // ── Order: create or get current ──

    @Transactional
    public OrderDto createOrGetCurrentOrder(TelegramSession session) {
        TelegramSession locked = telegramSessionRepository.findByIdForUpdate(session.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Telegram session not found"));

        if (locked.getLastOrderId() != null) {
            Order existing = orderRepository.findById(locked.getLastOrderId()).orElse(null);
            if (existing != null && existing.getStatus() == OrderStatus.OPEN
                    && locked.getRestaurantId().equals(existing.getRestaurantId())) {
                initOrderItems(existing);
                return OrderDto.fromEntity(existing);
            }
        }

        Order order = new Order();
        order.setStatus(OrderStatus.OPEN);
        order.setCreatedBy("TELEGRAM:" + locked.getTelegramUserId());
        order.setName("Telegram #" + locked.getTelegramUserId());
        order.setOrderSource(OrderSource.TELEGRAM);
        order.setRestaurant(restaurantRepository.findById(locked.getRestaurantId())
                .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));

        Order saved = orderRepository.save(order);
        businessMetrics.incrementOrdersCreated();

        locked.setLastOrderId(saved.getId());
        telegramSessionRepository.save(locked);

        log.info("Telegram order created: orderId={} userId={} restaurantId={}",
                saved.getId(), locked.getTelegramUserId(), locked.getRestaurantId());
        HashMap<String, Object> audit = new HashMap<>();
        audit.put("channel", StructuredAudit.CHANNEL_TELEGRAM);
        audit.put("telegramUserId", locked.getTelegramUserId());
        audit.put("telegramSessionId", locked.getId());
        audit.put("restaurantId", locked.getRestaurantId());
        audit.put("entityType", "ORDER");
        audit.put("entityId", saved.getId());
        StructuredAudit.success(AuditActions.ORDER_CREATED, audit);
        return OrderDto.fromEntity(saved);
    }

    // ── Order: get by id ──

    @Transactional(readOnly = true)
    public OrderDto getOrder(TelegramSession session, Long orderId) {
        Order order = loadAndVerifyOrder(session, orderId);
        return OrderDto.fromEntity(order);
    }

    // ── Order: add item ──

    @Transactional
    public OrderDto addItem(TelegramSession session, Long orderId, Long dishId, int qty, String comment,
                            List<AddPublicItemRequest.OptionSelection> selections) {
        if (qty <= 0) {
            throw new BusinessException("qty must be > 0");
        }

        Order order = loadAndVerifyOrder(session, orderId);

        Dish dish = dishRepository.findById(dishId).orElse(null);
        if (dish == null || !session.getRestaurantId().equals(dish.getRestaurantId())
                || !Boolean.TRUE.equals(dish.getIsActive())) {
            throw new ResourceNotFoundException("Dish not found or not available");
        }

        String normalizedComment = comment != null && !comment.trim().isEmpty() ? comment.trim() : null;
        boolean hasSelections = selections != null && !selections.isEmpty();

        if (!hasSelections) {
            OrderItem existing = order.getItems().stream()
                    .filter(i -> i.getDish().getId().equals(dishId))
                    .filter(i -> i.getOptions() == null || i.getOptions().isEmpty())
                    .filter(i -> {
                        String ic = i.getComment() != null && !i.getComment().trim().isEmpty()
                                ? i.getComment().trim() : null;
                        return Objects.equals(ic, normalizedComment);
                    })
                    .findFirst().orElse(null);

            if (existing != null) {
                int newQty = existing.getQty() + qty;
                // Проверяем склад ДО изменения количества позиции.
                orderStockCheckService.validateStockAfterItemQtyChange(order, existing, newQty);

                existing.setQty(existing.getQty() + qty);
                existing.calculateLineTotal();
                order.calculateTotalAmount();
                return OrderDto.fromEntity(orderRepository.save(order));
            }
        }

        List<OrderItemOption> snapshots = hasSelections
                ? publicOrderingService.buildAndValidateOptions(dish.getId(), selections)
                : List.of();

        // Проверяем склад ДО сохранения новой позиции.
        if (!snapshots.isEmpty()) {
            orderStockCheckService.validateStockAfterAdd(order, dish, qty, snapshots, null);
        }

        OrderItem item = new OrderItem();
        item.setOrder(order);
        item.setDish(dish);
        item.setQty(qty);
        item.setPriceAtTime(dish.getPrice());
        item.setComment(normalizedComment);
        if (!snapshots.isEmpty()) {
            for (OrderItemOption o : snapshots) o.setOrderItem(item);
            item.setOptions(snapshots);
        }
        item.calculateLineTotal();
        order.getItems().add(item);
        order.calculateTotalAmount();

        Order saved = orderRepository.save(order);
        log.info("Telegram item added: orderId={} dishId={} qty={} withOptions={}", orderId, dishId, qty, hasSelections);
        return OrderDto.fromEntity(saved);
    }

    // ── Order: remove item ──

    @Transactional
    public OrderDto removeItem(TelegramSession session, Long orderId, Long itemId) {
        Order order = loadAndVerifyOrder(session, orderId);

        boolean removed = order.getItems().removeIf(i -> i.getId().equals(itemId));
        if (!removed) {
            throw new ResourceNotFoundException("Order item not found");
        }

        order.calculateTotalAmount();
        Order saved = orderRepository.save(order);
        log.info("Telegram item removed: orderId={} itemId={}", orderId, itemId);
        return OrderDto.fromEntity(saved);
    }

    // ── Order: clear all items ──

    @Transactional
    public OrderDto clearItems(TelegramSession session, Long orderId) {
        Order order = loadAndVerifyOrder(session, orderId);
        order.getItems().clear();
        order.calculateTotalAmount();
        Order saved = orderRepository.save(order);
        log.info("Telegram order cleared: orderId={}", orderId);
        return OrderDto.fromEntity(saved);
    }

    // ── internal ──

    private Order loadAndVerifyOrder(TelegramSession session, Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found"));

        if (!session.getRestaurantId().equals(order.getRestaurantId())) {
            throw new AccessDeniedException("Order does not belong to this restaurant");
        }

        String expectedCreatedBy = "TELEGRAM:" + session.getTelegramUserId();
        if (!expectedCreatedBy.equals(order.getCreatedBy())) {
            throw new AccessDeniedException("Order does not belong to this user");
        }

        if (order.getStatus() != OrderStatus.OPEN) {
            throw new BusinessException("Order is not open");
        }

        initOrderItems(order);
        return order;
    }

    private void initOrderItems(Order order) {
        order.getItems().size();
        for (OrderItem item : order.getItems()) {
            item.getComment();
            item.getDish().getName();
        }
    }

    public static class AccessDeniedException extends RuntimeException implements com.restaurant.exception.HasApiErrorCode {
        private final String apiErrorCode;

        public AccessDeniedException(String message) {
            this(message, "TELEGRAM_ACCESS_DENIED");
        }

        public AccessDeniedException(String message, String apiErrorCode) {
            super(message);
            this.apiErrorCode = apiErrorCode;
        }

        @Override
        public String getApiErrorCode() {
            return apiErrorCode;
        }
    }
}
