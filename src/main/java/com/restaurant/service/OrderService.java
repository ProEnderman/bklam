package com.restaurant.service;

import com.restaurant.audit.AuditActions;
import com.restaurant.audit.StructuredAudit;
import com.restaurant.observability.BusinessMetrics;
import com.restaurant.dto.AddOrderItemRequest;
import com.restaurant.dto.AddPublicItemRequest;
import com.restaurant.dto.OrderDto;
import com.restaurant.event.OrderCancelledEvent;
import com.restaurant.event.OrderClosedEvent;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.Dish;
import com.restaurant.model.HallTable;
import com.restaurant.model.Order;
import com.restaurant.model.OrderItem;
import com.restaurant.model.OrderItemOption;
import com.restaurant.model.OrderPaymentMark;
import com.restaurant.model.OrderPaymentMarkId;
import com.restaurant.model.OrderStatus;
import com.restaurant.model.PricingRun;
import com.restaurant.repository.DishRepository;
import com.restaurant.model.HallZone;
import com.restaurant.repository.HallPlacedItemRepository;
import com.restaurant.repository.HallTableRepository;
import com.restaurant.repository.HallZoneRepository;
import com.restaurant.repository.OrderPaymentMarkRepository;
import com.restaurant.repository.LocationRepository;
import com.restaurant.repository.OrderRepository;
import com.restaurant.repository.OrderShareRepository;
import com.restaurant.repository.PricingRunRepository;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.StockMovementRepository;
import com.restaurant.repository.loyalty.GuestRepository;
import com.restaurant.model.loyalty.Guest;
import com.restaurant.security.SecurityUtils;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.OutputStreamWriter;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderService {

    private final BusinessMetrics businessMetrics;
    
    private final OrderPaymentMarkRepository orderPaymentMarkRepository;
    private final OrderShareRepository orderShareRepository;
    private final OrderRepository orderRepository;
    private final StockMovementRepository stockMovementRepository;
    private final PricingRunRepository pricingRunRepository;
    private final DishRepository dishRepository;
    private final RestaurantRepository restaurantRepository;
    private final LocationRepository locationRepository;
    private final HallTableRepository hallTableRepository;
    private final HallPlacedItemRepository hallPlacedItemRepository;
    private final HallZoneRepository hallZoneRepository;
    private final GuestRepository guestRepository;
    private final DishService dishService;
    private final StockService stockService;
    private final OrderStockCheckService orderStockCheckService;
    private final ActivityLogService activityLogService;
    private final PublicOrderingService publicOrderingService;
    private final ApplicationEventPublisher eventPublisher;
    private final OutboxService outboxService;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;

    private Long getRestaurantId() {
        if (SecurityUtils.isHeadAdmin()) {
            return null;
        }
        return SecurityUtils.getCurrentRestaurantId();
    }

    private record TableHallLabels(String tableLabel, String hallName) {}

    /** Подпись стола и зала/карты по расстановке на карте (для списка заказов и ответа при создании). */
    private TableHallLabels resolveTableHallLabels(Long tableId, HallTable tableIfKnown) {
        if (tableId == null) {
            return new TableHallLabels(null, null);
        }
        String tableLabel = tableIfKnown != null ? tableIfKnown.getLabel() : null;
        if (tableLabel == null) {
            tableLabel = hallTableRepository.findById(tableId).map(HallTable::getLabel).orElse(null);
        }
        String hallName = null;
        var placed = hallPlacedItemRepository.findByTableIdInWithHallMap(List.of(tableId));
        if (!placed.isEmpty()) {
            var pi = placed.get(0);
            if (pi.getHallMap() != null) {
                hallName = getZoneNameForPoint(pi.getHallMap().getId(), pi.getX(), pi.getY());
                if (hallName == null) {
                    hallName = pi.getHallMap().getName();
                }
            }
        }
        return new TableHallLabels(tableLabel, hallName);
    }

    /** Имя зала (зоны на карте), в которой находится точка (px, py). Зал = HallZone — выделенная территория. */
    private String getZoneNameForPoint(Long hallMapId, int px, int py) {
        if (hallMapId == null) return null;
        List<HallZone> zones = hallZoneRepository.findByHallMapIdOrderByIdAsc(hallMapId);
        for (HallZone z : zones) {
            if (z.getX() != null && z.getY() != null && z.getW() != null && z.getH() != null
                && px >= z.getX() && px < z.getX() + z.getW()
                && py >= z.getY() && py < z.getY() + z.getH()) {
                return z.getName();
            }
        }
        return null;
    }

    /** Группа для сортировки: 0 OPEN, 1 CLOSED не оплачены, 2 CLOSED оплачены, 3 CANCELED. */
    private static int orderGroup(Order o) {
        if (o.getStatus() == OrderStatus.OPEN) return 0;
        if (o.getStatus() == OrderStatus.CANCELED) return 3;
        if (o.getStatus() == OrderStatus.CLOSED) {
            return o.getPaidAt() != null ? 2 : 1;
        }
        return 4;
    }

    
    @Transactional(readOnly = true)
    public Page<OrderDto> getOrders(
        OrderStatus status,
        LocalDateTime fromDate,
        LocalDateTime toDate,
        Long dishId,
        Pageable pageable
    ) {
        log.debug("Getting orders: status={}, from={}, to={}, dishId={}", status, fromDate, toDate, dishId);
        Long restaurantId = getRestaurantId();

        LocalDateTime fromDateParam = fromDate != null ? fromDate : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime toDateParam = toDate != null ? toDate : LocalDateTime.of(2099, 12, 31, 23, 59, 59);

        // Один SQL с явными LIMIT/OFFSET после ORDER BY — порядок одинаков на всех страницах (нет «возврата» дат)
        int limit = pageable.getPageSize();
        int offset = (int) pageable.getOffset();
        List<Long> ids = orderRepository.findOrderIdsPageOrdered(
            restaurantId, status, fromDateParam, toDateParam, dishId, limit, offset);
        long total = orderRepository.countOrders(
            restaurantId, status, fromDateParam, toDateParam, dishId);
        if (ids.isEmpty()) {
            return new org.springframework.data.domain.PageImpl<>(
                List.of(), pageable, total);
        }

        List<Order> withItems = orderRepository.findOrdersWithItemsByIdIn(ids);
        for (Order order : withItems) {
            for (OrderItem item : order.getItems()) {
                item.getComment();
                item.getDish().getName();
                if (item.getOptions() != null) item.getOptions().size();
            }
        }
        // Собираем в порядке id из SQL запроса (порядок задан ORDER BY + LIMIT/OFFSET, пересортировка запрещена)
        Map<Long, Order> byId = new HashMap<>();
        for (Order o : withItems) {
            byId.put(o.getId(), o);
        }
        List<Order> ordered = new ArrayList<>();
        for (Long id : ids) {
            Order o = byId.get(id);
            if (o != null) ordered.add(o);
        }
        List<Long> tableIds = ordered.stream()
            .map(Order::getTableId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, String> tableIdToHallName = new HashMap<>();
        if (!tableIds.isEmpty()) {
            hallPlacedItemRepository.findByTableIdInWithHallMap(tableIds).forEach(pi -> {
                if (pi.getTable() != null && pi.getHallMap() != null && !tableIdToHallName.containsKey(pi.getTable().getId())) {
                    String zoneName = getZoneNameForPoint(pi.getHallMap().getId(), pi.getX(), pi.getY());
                    tableIdToHallName.put(pi.getTable().getId(), zoneName != null ? zoneName : pi.getHallMap().getName());
                }
            });
        }
        Map<Long, String> tableIdToLabel = new HashMap<>();
        if (!tableIds.isEmpty()) {
            hallTableRepository.findAllById(tableIds).forEach(t -> tableIdToLabel.put(t.getId(), t.getLabel()));
        }
        List<Long> guestIds = ordered.stream()
            .map(Order::getGuestId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
        Map<Long, String> guestIdToLabel = new HashMap<>();
        if (!guestIds.isEmpty()) {
            for (Guest g : guestRepository.findAllById(guestIds)) {
                guestIdToLabel.put(g.getId(), formatGuestLabel(g));
            }
        }
        Set<Long> orderIdsWithSplit = ids.isEmpty() ? Set.of() : orderShareRepository.findOrderIdsWithSplit(ids).stream().collect(Collectors.toSet());
        List<OrderPaymentMark> allMarks = ids.isEmpty() ? List.of() : orderPaymentMarkRepository.findByOrderIdIn(ids);
        Map<Long, List<OrderPaymentMark>> marksByOrderId = allMarks.stream().collect(Collectors.groupingBy(OrderPaymentMark::getOrderId));

        Map<Long, Integer> shareCountByOrderId = new HashMap<>();
        if (!orderIdsWithSplit.isEmpty()) {
            List<Long> splitIds = ids.stream().filter(orderIdsWithSplit::contains).toList();
            for (Object[] row : orderShareRepository.countSharesByOrderIdIn(splitIds)) {
                if (row == null || row.length < 2) continue;
                shareCountByOrderId.put(((Number) row[0]).longValue(), ((Number) row[1]).intValue());
            }
        }

        Page<Order> resultPage = new org.springframework.data.domain.PageImpl<>(
            ordered, pageable, total);
        return resultPage.map(o -> {
            Long tid = o.getTable() != null ? o.getTable().getId() : null;
            String tableLabel = tid != null ? tableIdToLabel.get(tid) : null;
            if (tableLabel == null && o.getTable() != null) {
                tableLabel = o.getTable().getLabel();
            }
            String hallName = tid != null ? tableIdToHallName.get(tid) : null;
            String guestLabel = o.getGuestId() != null ? guestIdToLabel.get(o.getGuestId()) : null;
            boolean hasSplit = orderIdsWithSplit.contains(o.getId());
            int shareCount = shareCountByOrderId.getOrDefault(o.getId(), 0);
            boolean allPaymentSlotsPaid = computeAllPaymentSlotsPaid(
                o.getId(),
                hasSplit,
                marksByOrderId.getOrDefault(o.getId(), List.of()),
                o.getPaymentAccountPayerJson(),
                shareCount);
            return OrderDto.fromEntity(o, tableLabel, hallName, guestLabel, hasSplit, allPaymentSlotsPaid);
        });
    }

    /**
     * Для split: оплачен, если для каждого ожидаемого слота ({@code order_{id}_pay_0..N-1}) есть отметка с {@code markedAt}.
     * Число слотов N = число уникальных плательщиков из {@code payment_account_payer_json}, иначе = число долей.
     * Старые «лишние» строки (UUID Telegram и т.д.) не учитываются — из‑за них раньше заказ вечно был «не оплачен».
     */
    private boolean computeAllPaymentSlotsPaid(
        Long orderId,
        boolean hasSplit,
        List<OrderPaymentMark> marks,
        String paymentAccountPayerJson,
        int shareCount
    ) {
        if (!hasSplit) return true;
        if (shareCount <= 0) return false;
        int expectedSlots = expectedSplitPaymentSlotCount(shareCount, paymentAccountPayerJson);
        if (expectedSlots <= 0) return false;
        for (int i = 0; i < expectedSlots; i++) {
            if (!isSplitPaymentSlotMarkedPaid(marks, orderId, i)) {
                return false;
            }
        }
        return true;
    }

    private int expectedSplitPaymentSlotCount(int shareCount, String paymentAccountPayerJson) {
        if (paymentAccountPayerJson == null || paymentAccountPayerJson.isBlank()) {
            return shareCount;
        }
        try {
            List<Integer> arr = objectMapper.readValue(paymentAccountPayerJson, new TypeReference<List<Integer>>() {});
            if (arr == null || arr.isEmpty() || arr.size() != shareCount) {
                return shareCount;
            }
            return new HashSet<>(arr).size();
        } catch (Exception e) {
            return shareCount;
        }
    }

    /** «Один счёт на всю сумму» в UI пишет отметку с id {@code order_{orderId}}, а не {@code order_{id}_pay_0}. */
    private boolean isFullOrderPaymentMarkedPaid(List<OrderPaymentMark> marks, Long orderId) {
        String fullBill = "order_" + orderId;
        String legacyFullCash = "cash_order_" + orderId;
        return marks.stream().anyMatch(m -> {
            if (m.getMarkedAt() == null) return false;
            String pid = m.getPaymentRequestId();
            return fullBill.equals(pid) || legacyFullCash.equals(pid);
        });
    }

    private boolean isSplitPaymentSlotMarkedPaid(List<OrderPaymentMark> marks, Long orderId, int slotIndex) {
        if (isFullOrderPaymentMarkedPaid(marks, orderId)) {
            return true;
        }
        String stable = "order_" + orderId + "_pay_" + slotIndex;
        String legacyCash = "cash_order_" + orderId + "_pay_" + slotIndex;
        return marks.stream().anyMatch(m -> {
            if (m.getMarkedAt() == null) return false;
            String pid = m.getPaymentRequestId();
            return stable.equals(pid) || legacyCash.equals(pid);
        });
    }

    /** Синхронизирует orders.paid_at со слотами оплаты / единым счётом (для списка «Заказы»). */
    private void refreshOrderPaidAtAfterPaymentMarks(Order order) {
        boolean hasSplit = orderShareRepository.existsByOrderId(order.getId());
        if (!hasSplit) {
            boolean anyMark = orderPaymentMarkRepository.findByOrderId(order.getId()).stream()
                .anyMatch(m -> m.getMarkedAt() != null);
            if (anyMark && order.getPaidAt() == null) {
                order.setPaidAt(LocalDateTime.now());
                order.setUnpaidReason(null);
                orderRepository.save(order);
            }
            return;
        }
        List<OrderPaymentMark> marks = orderPaymentMarkRepository.findByOrderId(order.getId());
        int shareCount = (int) orderShareRepository.countByOrder_Id(order.getId());
        boolean allPaid = computeAllPaymentSlotsPaid(
            order.getId(), true, marks, order.getPaymentAccountPayerJson(), shareCount);
        if (allPaid && order.getPaidAt() == null) {
            order.setPaidAt(LocalDateTime.now());
            order.setUnpaidReason(null);
            orderRepository.save(order);
        } else if (!allPaid && order.getPaidAt() != null) {
            order.setPaidAt(null);
            orderRepository.save(order);
        }
    }
    
    @Transactional(readOnly = true)
    public OrderDto getOrderById(Long id) {
        log.debug("Getting order by id: {}", id);
        Order order = orderRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + id));
        
        // Явно загружаем items и их комментарии, чтобы избежать LazyInitializationException
        order.getItems().size();
        // Инициализируем все поля items, включая комментарии
        for (OrderItem item : order.getItems()) {
            String comment = item.getComment();
            item.getDish().getName();
            if (item.getOptions() != null) item.getOptions().size();
            log.debug("OrderItem id={}, dishId={}, comment={}", item.getId(), item.getDish().getId(), comment);
        }
        
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        return toOrderDtoWithPaymentState(order);
    }

    private static String formatGuestLabel(Guest g) {
        String name = g.getName() != null ? g.getName().trim() : "";
        String phone = g.getPhoneNormalized() != null ? g.getPhoneNormalized().trim() : "";
        return (name + " " + phone).trim();
    }

    private OrderDto toOrderDtoWithPaymentState(Order order) {
        Long tableId = order.getTable() != null ? order.getTable().getId() : null;
        TableHallLabels placement = resolveTableHallLabels(tableId, order.getTable());
        String guestLabel = order.getGuest() != null ? formatGuestLabel(order.getGuest()) : null;
        boolean hasSplit = orderShareRepository.existsByOrderId(order.getId());
        List<OrderPaymentMark> marks = orderPaymentMarkRepository.findByOrderId(order.getId());
        int shareCount = (int) orderShareRepository.countByOrder_Id(order.getId());
        boolean allPaymentSlotsPaid = computeAllPaymentSlotsPaid(
            order.getId(),
            hasSplit,
            marks,
            order.getPaymentAccountPayerJson(),
            shareCount);
        return OrderDto.fromEntity(
            order, placement.tableLabel(), placement.hallName(), guestLabel, hasSplit, allPaymentSlotsPaid);
    }

    private OrderDto toNewOrderDtoWithPlacement(Order saved) {
        Long tableId = saved.getTable() != null ? saved.getTable().getId() : null;
        TableHallLabels placement = resolveTableHallLabels(tableId, saved.getTable());
        String guestLabel = saved.getGuest() != null ? formatGuestLabel(saved.getGuest()) : null;
        return OrderDto.fromEntity(saved, placement.tableLabel(), placement.hallName(), guestLabel, false, true);
    }
    
    @Transactional
    public OrderDto createOrder(String name, Long tableId, Long guestId, String idempotencyKey, String orderSource) {
        log.info("Creating new order with name: {}, tableId: {}, guestId: {}, idempotencyKey: {}, source: {}", name, tableId, guestId, idempotencyKey, orderSource);
        
        String normalizedKey = idempotencyKey != null && !idempotencyKey.isBlank()
            ? idempotencyKey.trim() : null;
        
        if (normalizedKey != null) {
            var existing = orderRepository.findByIdempotencyKey(normalizedKey);
            if (existing.isPresent()) {
                businessMetrics.incrementOrdersIdempotentReused();
                log.info("Idempotent hit: returning existing order id={} for key={}", existing.get().getId(), normalizedKey);
                Order order = existing.get();
                order.getItems().forEach(i -> { i.getComment(); i.getDish().getName(); });
                return toOrderDtoWithPaymentState(order);
            }
        }
        
        return doCreateOrder(name, tableId, guestId, normalizedKey, parseOrderSource(orderSource));
    }
    
    private com.restaurant.model.OrderSource parseOrderSource(String raw) {
        if (raw == null || raw.isBlank()) return com.restaurant.model.OrderSource.POS;
        try {
            return com.restaurant.model.OrderSource.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            log.warn("Unknown order source '{}', defaulting to POS", raw);
            return com.restaurant.model.OrderSource.POS;
        }
    }
    
    private OrderDto doCreateOrder(String name, Long tableId, Long guestId, String idempotencyKey, com.restaurant.model.OrderSource source) {
        // REGULAR_WORKER должен иметь право CREATE_ORDERS
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.CREATE_ORDERS)) {
            throw new BusinessException("You don't have permission to create orders");
        }
        
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required");
        }
        
        String currentUsername = SecurityUtils.getCurrentUser() != null ? 
            SecurityUtils.getCurrentUser().getUsername() : "system";
        
        Order order = new Order();
        order.setStatus(OrderStatus.OPEN);
        order.setCreatedBy(currentUsername);
        order.setName(name);
        order.setIdempotencyKey(idempotencyKey);
        order.setOrderSource(source);
        order.setRestaurant(restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        locationRepository.findByLegacyRestaurant_Id(restaurantId).ifPresent(order::setLocation);

        if (guestId != null) {
            Guest guest = guestRepository.findById(guestId)
                .orElseThrow(() -> new ResourceNotFoundException("Guest not found"));
            if (!restaurantId.equals(guest.getRestaurant().getId())) {
                throw new BusinessException("Access denied to this guest");
            }
            order.setGuest(guest);
        }
        
        // Привязываем к столу, если указан tableId
        if (tableId != null) {
            com.restaurant.model.HallTable table = hallTableRepository.findById(tableId)
                .orElseThrow(() -> new ResourceNotFoundException("Table not found"));
            if (!restaurantId.equals(table.getRestaurantId())) {
                throw new BusinessException("Access denied to this table");
            }
            order.setTable(table);
            // Если имя не задано, используем название стола
            if (name == null || name.isBlank()) {
                order.setName("Стол " + table.getLabel());
            }
        }
        
        Order saved;
        try {
            saved = orderRepository.save(order);
        } catch (DataIntegrityViolationException ex) {
            if (idempotencyKey != null) {
                businessMetrics.incrementOrdersIdempotentReused();
                log.warn("Idempotency race: unique constraint hit for key={}, fetching existing", idempotencyKey);
                return orderRepository.findByIdempotencyKey(idempotencyKey)
                    .map(existing -> {
                        existing.getItems().forEach(i -> { i.getComment(); i.getDish().getName(); });
                        return toOrderDtoWithPaymentState(existing);
                    })
                    .orElseThrow(() -> new BusinessException("Order creation failed"));
            }
            throw ex;
        }
        
        log.info("Created order with id: {}, name: {}, tableId: {}", saved.getId(), saved.getName(), tableId);
        businessMetrics.incrementOrdersCreated();

        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "CREATE",
            "ORDER",
            saved.getId(),
            username,
            String.format("Создан новый заказ #%d%s", saved.getId(), name != null ? " (" + name + ")" : ""),
            null,
            Map.of("status", saved.getStatus().toString(), "totalAmount", saved.getTotalAmount(), "name", name != null ? name : "")
        );
        } catch (Exception e) {
            log.error("Failed to log order creation activity: {}", e.getMessage());
        }

        try {
            HashMap<String, Object> audit = new HashMap<>();
            audit.put("channel", source.name());
            audit.put("entityType", "ORDER");
            audit.put("entityId", saved.getId());
            audit.put("restaurantId", restaurantId);
            Long uid = SecurityUtils.getCurrentUserId();
            if (uid != null) {
                audit.put("userId", uid);
            }
            StructuredAudit.success(AuditActions.ORDER_CREATED, audit);
        } catch (RuntimeException ignored) {
            // never fail order flow on audit
        }
        
        return toNewOrderDtoWithPlacement(saved);
    }

    @Transactional
    public OrderDto updateOrder(Long orderId, com.restaurant.dto.UpdateOrderRequest request) {
        if (request == null) {
            throw new BusinessException("Update request is required");
        }
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        if (request.name() != null) {
            order.setName(request.name());
        }
        if (Boolean.TRUE.equals(request.clearGuest())) {
            order.setGuest(null);
        } else if (request.guestId() != null) {
            Guest guest = guestRepository.findById(request.guestId())
                .orElseThrow(() -> new ResourceNotFoundException("Guest not found"));
            if (!order.getRestaurantId().equals(guest.getRestaurant().getId())) {
                throw new BusinessException("Access denied to this guest");
            }
            order.setGuest(guest);
        }
        if (request.tableId() != null) {
            com.restaurant.model.HallTable table = hallTableRepository.findById(request.tableId())
                .orElseThrow(() -> new ResourceNotFoundException("Table not found"));
            if (!order.getRestaurantId().equals(table.getRestaurantId())) {
                throw new BusinessException("Access denied to this table");
            }
            order.setTable(table);
        }
        Order saved = orderRepository.save(order);
        try {
            HashMap<String, Object> audit = new HashMap<>();
            audit.put("channel", StructuredAudit.CHANNEL_POS);
            audit.put("entityType", "ORDER");
            audit.put("entityId", saved.getId());
            audit.put("restaurantId", restaurantId);
            Long uid = SecurityUtils.getCurrentUserId();
            if (uid != null) {
                audit.put("userId", uid);
            }
            StructuredAudit.success(AuditActions.ORDER_UPDATED, audit);
        } catch (RuntimeException ignored) {
        }
        return getOrderById(saved.getId());
    }

    @Transactional(readOnly = true)
    public OrderDto getOpenOrderByTable(Long tableId) {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) throw new BusinessException("Restaurant ID is required");

        List<Order> orders = orderRepository.findOpenOrdersByTable(restaurantId, tableId);
        if (orders.isEmpty()) return null;
        Order order = orders.get(0);
        // init items
        order.getItems().size();
        for (OrderItem item : order.getItems()) {
            item.getComment();
            item.getDish().getName();
        }
        return toOrderDtoWithPaymentState(order);
    }

    @Transactional
    public OrderDto getOrCreateOpenOrderByTable(Long tableId) {
        // REGULAR_WORKER должен иметь право CREATE_ORDERS
        if (SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.CREATE_ORDERS)) {
            throw new BusinessException("You don't have permission to create orders");
        }

        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) throw new BusinessException("Restaurant ID is required");

        com.restaurant.model.HallTable table = hallTableRepository.findByIdForUpdate(tableId)
            .orElseThrow(() -> new ResourceNotFoundException("Table not found"));
        if (!restaurantId.equals(table.getRestaurantId())) throw new BusinessException("Access denied to this table");

        List<Order> open = orderRepository.findOpenOrdersByTable(restaurantId, tableId);
        if (!open.isEmpty()) {
            Order order = open.get(0);
            order.getItems().size();
            for (com.restaurant.model.OrderItem item : order.getItems()) {
                item.getComment();
                item.getDish().getName();
            }
            return toOrderDtoWithPaymentState(order);
        }

        String currentUsername = SecurityUtils.getCurrentUser() != null ?
            SecurityUtils.getCurrentUser().getUsername() : "system";

        Order order = new Order();
        order.setStatus(OrderStatus.OPEN);
        order.setCreatedBy(currentUsername);
        order.setName("Table " + table.getLabel());
        order.setOrderSource(com.restaurant.model.OrderSource.POS);
        order.setRestaurant(restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        locationRepository.findByLegacyRestaurant_Id(restaurantId).ifPresent(order::setLocation);
        order.setTable(table);

        Order saved = orderRepository.save(order);
        businessMetrics.incrementOrdersCreated();
        try {
            HashMap<String, Object> audit = new HashMap<>();
            audit.put("channel", StructuredAudit.CHANNEL_POS);
            audit.put("entityType", "ORDER");
            audit.put("entityId", saved.getId());
            audit.put("restaurantId", restaurantId);
            Long uid = SecurityUtils.getCurrentUserId();
            if (uid != null) {
                audit.put("userId", uid);
            }
            StructuredAudit.success(AuditActions.ORDER_CREATED, audit);
        } catch (RuntimeException ignored) {
        }
        return toNewOrderDtoWithPlacement(saved);
    }
    
    @Transactional
    public OrderDto addItemToOrder(Long orderId, AddOrderItemRequest request) {
        log.info("Adding item to order: orderId={}, dishId={}, qty={}",
            orderId, request.dishId(), request.qty());
        
        Order order = orderRepository.findByIdWithItemsOptions(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));

        // Важно: options — LAZY-коллекция. При отсутствии JOIN FETCH Hibernate может не заполнить её,
        // а мы используем options для расчёта складского расхода при добавлении.
        // Инициализируем options для всех позиций ДО stock-check.
        if (order.getItems() != null) {
            for (OrderItem oi : order.getItems()) {
                if (oi.getOptions() != null) {
                    oi.getOptions().size();
                }
            }
        }
        
        // Проверка прав доступа к ресторану
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        
        // REGULAR_WORKER может редактировать только свои заказы или все, если есть право
        if (SecurityUtils.isRegularWorker()) {
            String currentUsername = SecurityUtils.getCurrentUser() != null ? 
                SecurityUtils.getCurrentUser().getUsername() : null;
            boolean isOwnOrder = currentUsername != null && currentUsername.equals(order.getCreatedBy());
            
            if (isOwnOrder && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.EDIT_OWN_ORDERS)) {
                throw new BusinessException("You don't have permission to edit orders");
            }
            if (!isOwnOrder && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.EDIT_ALL_ORDERS)) {
                throw new BusinessException("You can only edit your own orders");
            }
        }
        
        if (order.getStatus() != OrderStatus.OPEN) {
            throw new BusinessException("Cannot add items to closed order");
        }
        
        Dish dish = dishRepository.findById(request.dishId())
            .orElseThrow(() -> new ResourceNotFoundException("Dish not found with id: " + request.dishId()));
        
        // Проверка, что блюдо из того же ресторана
        if (!restaurantId.equals(dish.getRestaurantId())) {
            throw new BusinessException("Cannot add dish from another restaurant");
        }
        
        if (!dish.getIsActive()) {
            throw new BusinessException("Dish is not active");
        }
        
        // Проверяем, есть ли уже такой товар в заказе с таким же комментарием
        // Если комментарий отличается, создаем новую позицию
        String requestComment = request.comment() != null && !request.comment().trim().isEmpty() 
            ? request.comment().trim() : null;

        // Convert selections if present
        List<AddPublicItemRequest.OptionSelection> selections = request.selections();
        java.util.List<OrderItemOption> snapshotOptions = publicOrderingService.buildAndValidateOptions(dish.getId(), selections);
        boolean hasSelections = snapshotOptions != null && !snapshotOptions.isEmpty();

        OrderItem mergeTarget = null;
        if (!hasSelections) {
            mergeTarget = order.getItems().stream()
                .filter(item -> item.getDish().getId().equals(request.dishId()))
                .filter(item -> (item.getOptions() == null || item.getOptions().isEmpty()))
                .filter(item -> {
                    String itemComment = item.getComment() != null && !item.getComment().trim().isEmpty() 
                        ? item.getComment().trim() : null;
                    return (itemComment == null && requestComment == null) || 
                           (itemComment != null && itemComment.equals(requestComment));
                })
                .findFirst()
                .orElse(null);
        }

        orderStockCheckService.validateStockAfterAdd(order, dish, request.qty(), snapshotOptions, mergeTarget);

        if (mergeTarget != null) {
            mergeTarget.setQty(mergeTarget.getQty() + request.qty());
            mergeTarget.calculateLineTotal();
        } else {
            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setDish(dish);
            item.setQty(request.qty());
            item.setPriceAtTime(dish.getPrice());
            item.setComment(requestComment);
            if (hasSelections) {
                for (OrderItemOption opt : snapshotOptions) {
                    opt.setOrderItem(item);
                }
                item.setOptions(snapshotOptions);
            }
            item.calculateLineTotal();
            order.getItems().add(item);
        }
        
        order.calculateTotalAmount();
        Order saved = orderRepository.save(order);
        log.info("Added item to order: orderId={}", orderId);
        
        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "ADD_ITEM",
            "ORDER",
            orderId,
            username,
            String.format("Добавлена позиция в заказ #%d: %s, количество: %d", 
                orderId, dish.getName(), request.qty()),
            Map.of("itemsCount", saved.getItems().size() - 1, "totalAmount", saved.getTotalAmount().subtract(dish.getPrice().multiply(BigDecimal.valueOf(request.qty())))),
            Map.of("itemsCount", saved.getItems().size(), "totalAmount", saved.getTotalAmount(),
                   "dishId", dish.getId(), "dishName", dish.getName(), "qty", request.qty())
        );
        } catch (Exception e) {
            log.error("Failed to log add item activity: {}", e.getMessage());
        }
        
        return OrderDto.fromEntity(saved);
    }
    
    @Transactional
    public OrderDto updateOrderItem(Long orderId, Long itemId, Integer qty, String comment) {
        log.info("Updating order item: orderId={}, itemId={}, qty={}", orderId, itemId, qty);
        
        Order order = orderRepository.findByIdWithItemsOptions(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));

        // Аналогично addItem: гарантируем, что options позиций загружены для корректного stock-check.
        if (order.getItems() != null) {
            for (OrderItem oi : order.getItems()) {
                if (oi.getOptions() != null) {
                    oi.getOptions().size();
                }
            }
        }
        
        // Проверка прав доступа к ресторану
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        
        // REGULAR_WORKER может редактировать только свои заказы или все, если есть право
        if (SecurityUtils.isRegularWorker()) {
            String currentUsername = SecurityUtils.getCurrentUser() != null ? 
                SecurityUtils.getCurrentUser().getUsername() : null;
            boolean isOwnOrder = currentUsername != null && currentUsername.equals(order.getCreatedBy());
            
            if (isOwnOrder && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.EDIT_OWN_ORDERS)) {
                throw new BusinessException("You don't have permission to edit orders");
            }
            if (!isOwnOrder && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.EDIT_ALL_ORDERS)) {
                throw new BusinessException("You can only edit your own orders");
            }
        }
        
        if (order.getStatus() != OrderStatus.OPEN) {
            throw new BusinessException("Cannot update closed order");
        }
        
        OrderItem item = order.getItems().stream()
            .filter(i -> i.getId().equals(itemId))
            .findFirst()
            .orElseThrow(() -> new ResourceNotFoundException("Order item not found with id: " + itemId));
        
        orderStockCheckService.validateStockAfterItemQtyChange(order, item, qty);
        
        item.setQty(qty);
        if (comment != null) {
            item.setComment(comment.trim().isEmpty() ? null : comment.trim());
        }
        item.calculateLineTotal();
        
        order.calculateTotalAmount();
        Order saved = orderRepository.save(order);
        log.info("Updated order item: orderId={}, itemId={}", orderId, itemId);
        
        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "UPDATE_ITEM",
            "ORDER",
            orderId,
            username,
            String.format("Обновлена позиция в заказе #%d: %s, новое количество: %d", 
                orderId, item.getDish().getName(), qty),
            Map.of("itemId", itemId, "oldQty", item.getQty()),
            Map.of("itemId", itemId, "newQty", qty, "totalAmount", saved.getTotalAmount())
        );
        } catch (Exception e) {
            log.error("Failed to log update item activity: {}", e.getMessage());
        }
        
        return OrderDto.fromEntity(saved);
    }
    
    @Transactional
    public OrderDto removeOrderItem(Long orderId, Long itemId) {
        log.info("Removing order item: orderId={}, itemId={}", orderId, itemId);
        
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        
        // Проверка прав доступа к ресторану
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        
        // REGULAR_WORKER может редактировать только свои заказы или все, если есть право
        if (SecurityUtils.isRegularWorker()) {
            String currentUsername = SecurityUtils.getCurrentUser() != null ? 
                SecurityUtils.getCurrentUser().getUsername() : null;
            boolean isOwnOrder = currentUsername != null && currentUsername.equals(order.getCreatedBy());
            
            if (isOwnOrder && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.EDIT_OWN_ORDERS)) {
                throw new BusinessException("You don't have permission to edit orders");
            }
            if (!isOwnOrder && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.EDIT_ALL_ORDERS)) {
                throw new BusinessException("You can only edit your own orders");
            }
        }
        
        if (order.getStatus() != OrderStatus.OPEN) {
            throw new BusinessException("Cannot remove items from closed order");
        }
        
        boolean removed = order.getItems().removeIf(item -> item.getId().equals(itemId));
        if (!removed) {
            throw new ResourceNotFoundException("Order item not found with id: " + itemId);
        }
        
        Order saved = orderRepository.save(order);
        log.info("Removed order item: orderId={}, itemId={}", orderId, itemId);
        
        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "REMOVE_ITEM",
            "ORDER",
            orderId,
            username,
            String.format("Удалена позиция из заказа #%d", orderId),
            Map.of("itemsCount", saved.getItems().size() + 1),
            Map.of("itemsCount", saved.getItems().size(), "totalAmount", saved.getTotalAmount())
        );
        } catch (Exception e) {
            log.error("Failed to log remove item activity: {}", e.getMessage());
        }
        
        return OrderDto.fromEntity(saved);
    }
    
    @Transactional
    public OrderDto closeOrder(Long orderId) {
        log.info("Closing order: {}", orderId);
        
        Order order = orderRepository.findByIdWithItemsOptions(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        
        // Проверка прав доступа к ресторану
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        
        // REGULAR_WORKER может закрывать только свои заказы или все, если есть право
        if (SecurityUtils.isRegularWorker()) {
            String currentUsername = SecurityUtils.getCurrentUser() != null ? 
                SecurityUtils.getCurrentUser().getUsername() : null;
            boolean isOwnOrder = currentUsername != null && currentUsername.equals(order.getCreatedBy());
            
            if (isOwnOrder && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.CLOSE_OWN_ORDERS)) {
                throw new BusinessException("You don't have permission to close orders");
            }
            if (!isOwnOrder && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.CLOSE_ALL_ORDERS)) {
                throw new BusinessException("You can only close your own orders");
            }
        }
        
        if (order.getStatus() == OrderStatus.CLOSED) {
            throw new BusinessException("Order is already closed");
        }
        
        if (order.getItems().isEmpty()) {
            throw new BusinessException("Cannot close order without items");
        }
        validateSplitConsistencyBeforeClosing(order);
        
        // Вычисляем расход ингредиентов (рецепт × кол-во + модификаторы склада)
        Map<Long, Double> ingredientUsage = new HashMap<>();
        for (OrderItem item : order.getItems()) {
            List<com.restaurant.dto.DishIngredientDto> recipe = dishService.getRecipe(item.getDish().getId());

            if (recipe.isEmpty()) {
                throw new BusinessException(
                    String.format("Dish '%s' has no recipe", item.getDish().getName()));
            }

            Map<Long, Double> line = new HashMap<>();
            for (var recipeItem : recipe) {
                line.merge(recipeItem.ingredientId(), recipeItem.qtyPerDish() * item.getQty(), Double::sum);
            }

            orderStockCheckService.applyOptionStockAdjustments(item, recipe, line);

            for (var e : line.entrySet()) {
                ingredientUsage.merge(e.getKey(), e.getValue(), Double::sum);
            }
        }
        
        // Списание ингредиентов
        stockService.processOrderStockOut(orderId, ingredientUsage);
        
        // Закрываем заказ
        order.setStatus(OrderStatus.CLOSED);
        order.setClosedAt(com.restaurant.util.TimeUtils.now());
        order.calculateTotalAmount();
        Order saved = orderRepository.save(order);
        
        log.info("Order closed: orderId={}, totalAmount={}", orderId, saved.getTotalAmount());
        
        eventPublisher.publishEvent(new OrderClosedEvent(
            saved.getId(),
            saved.getRestaurantId(),
            saved.getTotalAmount(),
            saved.getGuestId()
        ));
        outboxService.appendOrderClosed(
            saved.getId(),
            saved.getRestaurantId(),
            saved.getTotalAmount(),
            saved.getGuestId()
        );

        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "CLOSE_ORDER",
            "ORDER",
            orderId,
            username,
            String.format("Закрыт заказ #%d, сумма: %.2f, списано ингредиентов: %d", 
                orderId, saved.getTotalAmount(), ingredientUsage.size()),
            Map.of("status", OrderStatus.OPEN.toString()),
            Map.of("status", OrderStatus.CLOSED.toString(), "totalAmount", saved.getTotalAmount(),
                   "itemsCount", saved.getItems().size(), "ingredientsUsed", ingredientUsage.size())
        );
        } catch (Exception e) {
            log.error("Failed to log close order activity: {}", e.getMessage());
        }
        
        return OrderDto.fromEntity(saved);
    }

    /**
     * If split exists, ensure each order item is still fully partitioned after edits.
     * Otherwise closing can lock in invalid split state.
     */
    private void validateSplitConsistencyBeforeClosing(Order order) {
        if (!orderShareRepository.existsByOrderId(order.getId())) {
            return;
        }
        List<com.restaurant.model.OrderShare> shares = orderShareRepository.findByOrderIdWithItems(order.getId());
        Map<Long, Integer> assignedByOrderItem = new HashMap<>();
        for (var share : shares) {
            if (share.getShareItems() == null) continue;
            for (var shareItem : share.getShareItems()) {
                if (shareItem == null || shareItem.getOrderItem() == null) continue;
                Long orderItemId = shareItem.getOrderItem().getId();
                if (orderItemId == null) continue;
                assignedByOrderItem.merge(orderItemId, shareItem.getQty(), Integer::sum);
            }
        }
        List<String> mismatches = new ArrayList<>();
        for (OrderItem item : order.getItems()) {
            int assigned = assignedByOrderItem.getOrDefault(item.getId(), 0);
            if (assigned != item.getQty()) {
                mismatches.add(String.format("%s: %d/%d", item.getDish().getName(), assigned, item.getQty()));
            }
        }
        if (!mismatches.isEmpty()) {
            throw new BusinessException("Split distribution is outdated after order edits. Reconfigure split first: "
                + String.join("; ", mismatches));
        }
    }
    
    @Transactional
    public OrderDto cancelOrder(Long orderId) {
        log.info("Canceling order: {}", orderId);
        
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        
        // Проверка прав доступа к ресторану
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        
        // REGULAR_WORKER может отменять только свои заказы или все, если есть право
        if (SecurityUtils.isRegularWorker()) {
            String currentUsername = SecurityUtils.getCurrentUser() != null ? 
                SecurityUtils.getCurrentUser().getUsername() : null;
            boolean isOwnOrder = currentUsername != null && currentUsername.equals(order.getCreatedBy());
            
            if (isOwnOrder && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.CANCEL_OWN_ORDERS)) {
                throw new BusinessException("You don't have permission to cancel orders");
            }
            if (!isOwnOrder && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.CANCEL_ALL_ORDERS)) {
                throw new BusinessException("You can only cancel your own orders");
            }
        }
        
        if (order.getStatus() == OrderStatus.CLOSED) {
            throw new BusinessException("Cannot cancel closed order");
        }
        
        if (order.getStatus() == OrderStatus.CANCELED) {
            throw new BusinessException("Order is already canceled");
        }
        
        order.setStatus(OrderStatus.CANCELED);
        Order saved = orderRepository.save(order);
        
        log.info("Order canceled: orderId={}", orderId);
        
        eventPublisher.publishEvent(new OrderCancelledEvent(
            saved.getId(),
            saved.getRestaurantId()
        ));
        
        // Логирование активности в отдельной транзакции
        try {
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
        activityLogService.logActivity(
            "CANCEL_ORDER",
            "ORDER",
            orderId,
            username,
            String.format("Отменен заказ #%d", orderId),
            Map.of("status", order.getStatus().toString()),
            Map.of("status", OrderStatus.CANCELED.toString())
        );
        } catch (Exception e) {
            log.error("Failed to log cancel order activity: {}", e.getMessage());
        }
        
        return OrderDto.fromEntity(saved);
    }
    
    @Transactional
    public OrderDto markOrderPaid(Long orderId) {
        log.info("Marking order as paid: {}", orderId);
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        if (order.getStatus() == OrderStatus.CANCELED) {
            throw new BusinessException("Нельзя оплатить отменённый заказ");
        }
        order.setPaidAt(LocalDateTime.now());
        order.setUnpaidReason(null);
        Order saved = orderRepository.save(order);

        String username = SecurityUtils.getCurrentUser() != null
            ? SecurityUtils.getCurrentUser().getUsername() : "system";
        try {
            activityLogService.logActivity(
                "MARK_PAID",
                "ORDER",
                orderId,
                username,
                String.format("Заказ #%d отмечен как оплаченный, сумма: %s", orderId, saved.getTotalAmount()),
                null,
                Map.of("paidAt", saved.getPaidAt().toString(), "totalAmount", saved.getTotalAmount())
            );
        } catch (Exception e) {
            log.error("Failed to log mark-paid activity: {}", e.getMessage());
        }

        return getOrderById(saved.getId());
    }

    @Transactional
    public OrderDto markOrderUnpaid(Long orderId, String reason) {
        log.info("Marking order as unpaid: {}, reason: {}", orderId, reason);
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        order.setPaidAt(null);
        order.setUnpaidReason(reason);
        Order saved = orderRepository.save(order);

        String username = SecurityUtils.getCurrentUser() != null
            ? SecurityUtils.getCurrentUser().getUsername() : "system";
        try {
            activityLogService.logActivity(
                "MARK_UNPAID",
                "ORDER",
                orderId,
                username,
                String.format("Снята оплата с заказа #%d, причина: %s", orderId, reason != null ? reason : "—"),
                Map.of("paidAt", order.getPaidAt() != null ? order.getPaidAt().toString() : ""),
                Map.of("unpaidReason", reason != null ? reason : "")
            );
        } catch (Exception e) {
            log.error("Failed to log mark-unpaid activity: {}", e.getMessage());
        }

        return getOrderById(saved.getId());
    }

    @Transactional
    public void deleteOrder(Long orderId) {
        log.info("Deleting order: {}", orderId);
        
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        
        // Проверка прав доступа к ресторану
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null || !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        
        // Только ADMIN может удалять заказы
        if (!SecurityUtils.isAdmin() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.DELETE_ORDERS)) {
            throw new BusinessException("You don't have permission to delete orders");
        }
        
        // Нельзя удалять закрытые заказы (они уже обработаны и списаны со склада)
        if (order.getStatus() == OrderStatus.CLOSED) {
            throw new BusinessException("Cannot delete closed order");
        }
        
        // Сохраняем информацию о заказе для логирования
        Map<String, Object> oldValues = Map.of(
            "status", order.getStatus().toString(),
            "totalAmount", order.getTotalAmount(),
            "createdBy", order.getCreatedBy(),
            "itemsCount", order.getItems().size()
        );
        
        // Отвязываем связанные записи, чтобы удаление заказа не блокировалось FK
        stockMovementRepository.clearOrderIdByOrderId(orderId);
        List<PricingRun> pricingRuns = pricingRunRepository.findByOrderId(orderId);
        if (!pricingRuns.isEmpty()) {
            pricingRuns.forEach(pr -> pr.setOrder(null));
            pricingRunRepository.saveAll(pricingRuns);
        }
        
        // Удаляем заказ
        orderRepository.delete(order);
        log.info("Order deleted: orderId={}, status={}, totalAmount={}", 
            orderId, order.getStatus(), order.getTotalAmount());
        
        // Логирование активности в отдельной транзакции
        try {
            activityLogService.logActivity(
                "DELETE",
                "ORDER",
                orderId,
                SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system",
                String.format("Удален заказ #%d", orderId),
                oldValues,
                null
            );
        } catch (Exception e) {
            log.error("Failed to log delete order activity: {}", e.getMessage());
        }
    }

    /** Отметки оплаты по слотам (QR): заказ может быть частично оплачен. Возвращает для каждого paymentRequestId: paid и paidVia (ONLINE | CASH). */
    @Transactional(readOnly = true)
    public Map<String, Map<String, Object>> getPaymentMarks(Long orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        Map<String, Map<String, Object>> out = new HashMap<>();
        for (OrderPaymentMark m : orderPaymentMarkRepository.findByOrderId(orderId)) {
            boolean paid = m.getMarkedAt() != null;
            String paidVia = paid && m.getPaidVia() != null && "CASH".equalsIgnoreCase(m.getPaidVia()) ? "CASH" : "ONLINE";
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("paid", paid);
            row.put("paidVia", paidVia);
            String tg = m.getTelegramPaymentRequestId();
            if (tg != null && !tg.isBlank()) {
                row.put("telegramPaymentRequestId", tg);
            }
            out.put(m.getPaymentRequestId(), row);
        }
        return out;
    }

    @Transactional
    public void setPaymentMark(Long orderId, String paymentRequestId, boolean markedPaid, String paidVia, String telegramPaymentRequestId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        OrderPaymentMarkId id = new OrderPaymentMarkId(orderId, paymentRequestId);
        OrderPaymentMark m = orderPaymentMarkRepository.findById(id).orElseGet(() -> {
            OrderPaymentMark mark = new OrderPaymentMark();
            mark.setOrderId(orderId);
            mark.setPaymentRequestId(paymentRequestId);
            mark.setMarkedAt(null);
            mark.setPaidVia(null);
            mark.setTelegramPaymentRequestId(null);
            return mark;
        });
        if (!markedPaid) {
            m.setMarkedAt(null);
            m.setPaidVia(null);
            m.setTelegramPaymentRequestId(null);
        } else {
            m.setMarkedAt(LocalDateTime.now());
            if (paidVia != null && "CASH".equalsIgnoreCase(paidVia)) {
                m.setPaidVia("CASH");
                m.setTelegramPaymentRequestId(null);
            } else {
                m.setPaidVia("ONLINE");
                if (telegramPaymentRequestId != null && !telegramPaymentRequestId.isBlank()) {
                    m.setTelegramPaymentRequestId(telegramPaymentRequestId.trim());
                }
            }
        }
        try {
            orderPaymentMarkRepository.save(m);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            LocalDateTime markedAt = m.getMarkedAt();
            String paidViaVal = m.getPaidVia();
            String telegramVal = m.getTelegramPaymentRequestId();
            Boolean updated = transactionTemplate.execute(status -> {
                OrderPaymentMark existing = orderPaymentMarkRepository.findById(id)
                    .orElse(null);
                if (existing == null) return Boolean.FALSE;
                existing.setMarkedAt(markedAt);
                existing.setPaidVia(paidViaVal);
                existing.setTelegramPaymentRequestId(telegramVal);
                orderPaymentMarkRepository.save(existing);
                return Boolean.TRUE;
            });
            if (Boolean.FALSE.equals(updated)) {
                throw new BusinessException("Payment mark conflict");
            }
        }
        refreshOrderPaidAtAfterPaymentMarks(order);
    }

    @Transactional
    public OrderDto updatePaymentAccountPayer(Long orderId, List<Integer> accountPayer) {
        if (accountPayer == null || accountPayer.isEmpty()) {
            throw new BusinessException("accountPayer is required");
        }
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        Long restaurantId = getRestaurantId();
        if (restaurantId != null && !restaurantId.equals(order.getRestaurantId())) {
            throw new BusinessException("Access denied to this order");
        }
        if (!orderShareRepository.existsByOrderId(orderId)) {
            throw new BusinessException("Order has no split bill");
        }
        long shareCount = orderShareRepository.countByOrder_Id(orderId);
        if (accountPayer.size() != shareCount) {
            throw new BusinessException("accountPayer length must match number of split shares");
        }
        int max = (int) shareCount - 1;
        for (Integer v : accountPayer) {
            if (v == null || v < 0 || v > max) {
                throw new BusinessException("Invalid accountPayer entry");
            }
        }
        try {
            order.setPaymentAccountPayerJson(objectMapper.writeValueAsString(accountPayer));
        } catch (JsonProcessingException e) {
            throw new BusinessException("Could not save payment layout");
        }
        orderRepository.save(order);
        return getOrderById(orderId);
    }

    private static final DateTimeFormatter CSV_DATETIME = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    /** Экспорт заказов ресторана в CSV (одна строка на позицию заказа). */
    @Transactional(readOnly = true)
    public byte[] exportOrdersToCsv(LocalDate from, LocalDate to) {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required for export");
        }
        LocalDateTime fromDt = from != null ? from.atStartOfDay() : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime toDt = to != null ? to.atTime(23, 59, 59) : LocalDateTime.of(2099, 12, 31, 23, 59, 59);
        List<Order> orders = orderRepository.findOrdersWithItems(restaurantId, null, fromDt, toDt, null);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        OutputStreamWriter w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        try {
            w.write("\uFEFF"); // BOM for Excel
            w.write("order_id,created_at,closed_at,status,total_amount,name,created_by,dish_id,dish_name,qty,price_at_time,line_total,comment\n");
            for (Order o : orders) {
                String orderPrefix = o.getId() + "," + escapeCsv(o.getCreatedAt() != null ? o.getCreatedAt().format(CSV_DATETIME) : "")
                    + "," + escapeCsv(o.getClosedAt() != null ? o.getClosedAt().format(CSV_DATETIME) : "")
                    + "," + (o.getStatus() != null ? o.getStatus().name() : "") + ","
                    + (o.getTotalAmount() != null ? o.getTotalAmount().toPlainString() : "0") + ","
                    + escapeCsv(o.getName()) + "," + escapeCsv(o.getCreatedBy());
                if (o.getItems() == null || o.getItems().isEmpty()) {
                    w.write(orderPrefix + ",,,,,\n");
                } else {
                    for (OrderItem item : o.getItems()) {
                        w.write(orderPrefix + "," + (item.getDish() != null ? item.getDish().getId() : "") + ","
                            + escapeCsv(item.getDish() != null ? item.getDish().getName() : "") + ","
                            + (item.getQty() != null ? item.getQty() : 0) + ","
                            + (item.getPriceAtTime() != null ? item.getPriceAtTime().toPlainString() : "") + ","
                            + (item.getLineTotal() != null ? item.getLineTotal().toPlainString() : "") + ","
                            + escapeCsv(item.getComment()) + "\n");
                    }
                }
            }
            w.flush();
        } catch (java.io.IOException e) {
            throw new BusinessException("Export failed: " + e.getMessage());
        }
        return out.toByteArray();
    }

    private static String escapeCsv(String s) {
        if (s == null) return "";
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    /** Импорт заказов из CSV. Группировка по (created_at, name). Колонки: created_at,closed_at,status,total_amount,name,created_by,dish_id,dish_name,qty,price_at_time. */
    @Transactional
    public Map<String, Object> importOrdersFromCsv(byte[] csvBytes) {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant ID is required for import");
        }
        String csv = new String(csvBytes, StandardCharsets.UTF_8).replace("\uFEFF", "");
        String[] lines = csv.split("\\r?\\n");
        if (lines.length < 2) {
            return Map.of("created", 0, "errors", List.of("CSV must have header and at least one row"));
        }
        int created = 0;
        List<String> errors = new ArrayList<>();
        Map<String, List<String[]>> groups = new LinkedHashMap<>();
        for (int i = 1; i < lines.length; i++) {
            String line = lines[i];
            if (line.isBlank()) continue;
            List<String> cells = parseCsvLine(line);
            if (cells.size() < 8) {
                errors.add("Line " + (i + 1) + ": too few columns");
                continue;
            }
            String createdAt = cells.get(0);
            String name = cells.size() > 4 ? cells.get(4) : "";
            String key = createdAt + "|" + name;
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(cells.toArray(new String[0]));
        }
        String username = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "import";
        com.restaurant.model.Restaurant restaurant = restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found"));
        for (Map.Entry<String, List<String[]>> e : groups.entrySet()) {
            List<String[]> rows = e.getValue();
            if (rows.isEmpty()) continue;
            String[] first = rows.get(0);
            LocalDateTime createdAt = parseDateTime(first[0]);
            LocalDateTime closedAt = first.length > 1 ? parseDateTime(first[1]) : null;
            OrderStatus status = first.length > 2 ? parseStatus(first[2]) : OrderStatus.CLOSED;
            String name = first.length > 4 ? first[4] : "";
            String createdBy = first.length > 5 ? first[5] : username;
            Order order = new Order();
            order.setRestaurant(restaurant);
            locationRepository.findByLegacyRestaurant_Id(restaurant.getId()).ifPresent(order::setLocation);
            order.setCreatedAt(createdAt != null ? createdAt : LocalDateTime.now());
            order.setClosedAt(closedAt);
            order.setStatus(status);
            order.setName(name);
            order.setCreatedBy(createdBy);
            order.setTotalAmount(BigDecimal.ZERO);
            order.getItems(); // init
            for (String[] row : rows) {
                if (row.length < 9) continue;
                String dishIdStr = row[6];
                String qtyStr = row.length > 8 ? row[8] : "1";
                String priceStr = row.length > 9 ? row[9] : "0";
                Long dishId = null;
                try {
                    dishId = Long.parseLong(dishIdStr.trim());
                } catch (NumberFormatException ex) {
                    errors.add("Invalid dish_id: " + dishIdStr);
                    continue;
                }
                Dish dish = dishRepository.findById(dishId).orElse(null);
                if (dish == null || !restaurantId.equals(dish.getRestaurantId())) {
                    errors.add("Dish not found or wrong restaurant: " + dishId);
                    continue;
                }
                int qty = 1;
                try {
                    qty = Integer.parseInt(qtyStr.trim());
                } catch (NumberFormatException ignored) {}
                if (qty < 1) qty = 1;
                BigDecimal price = BigDecimal.ZERO;
                try {
                    price = new BigDecimal(priceStr.trim());
                } catch (NumberFormatException ignored) {}
                OrderItem item = new OrderItem();
                item.setOrder(order);
                item.setDish(dish);
                item.setQty(qty);
                item.setPriceAtTime(price);
                item.setLineTotal(price.multiply(BigDecimal.valueOf(qty)));
                order.getItems().add(item);
            }
            if (order.getItems().isEmpty()) {
                errors.add("Order " + name + " has no valid items, skipped");
                continue;
            }
            order.calculateTotalAmount();
            orderRepository.save(order);
            created++;
        }
        return Map.of("created", created, "errors", errors);
    }

    private static List<String> parseCsvLine(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cur.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if ((c == ',' && !inQuotes) || c == '\n' || c == '\r') {
                out.add(cur.toString().trim());
                cur = new StringBuilder();
            } else {
                cur.append(c);
            }
        }
        out.add(cur.toString().trim());
        return out;
    }

    private static LocalDateTime parseDateTime(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return LocalDateTime.parse(s.trim(), CSV_DATETIME);
        } catch (Exception e) {
            try {
                return LocalDate.parse(s.trim()).atStartOfDay();
            } catch (Exception e2) {
                return null;
            }
        }
    }

    private static OrderStatus parseStatus(String s) {
        if (s == null || s.isBlank()) return OrderStatus.CLOSED;
        try {
            return OrderStatus.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return OrderStatus.CLOSED;
        }
    }
}

