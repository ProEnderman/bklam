package com.restaurant.service;

import com.restaurant.audit.AuditActions;
import com.restaurant.audit.StructuredAudit;
import com.restaurant.dto.*;
import com.restaurant.model.*;
import com.restaurant.model.OptionGroupTemplate.OptionGroupType;
import com.restaurant.repository.*;
import com.restaurant.security.QrSigningUtil;
import com.restaurant.observability.BusinessMetrics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PublicOrderingService {

    private final BusinessMetrics businessMetrics;
    private final QrSigningUtil qrSigningUtil;
    private final GuestSessionRepository guestSessionRepository;
    private final DishRepository dishRepository;
    private final DishCategoryRepository dishCategoryRepository;
    private final HallTableRepository hallTableRepository;
    private final OrderRepository orderRepository;
    private final RestaurantRepository restaurantRepository;
    private final DishOptionGroupRepository dishOptionGroupRepository;
    private final OrderStockCheckService orderStockCheckService;

    // ── Token / Session helpers ──

    public Long validateTokenAndExtractRestaurantId(String token) {
        if (!qrSigningUtil.verify(token)) return null;
        return qrSigningUtil.extractRestaurantId(token);
    }

    public GuestSession resolveSession(String sessionToken) {
        if (sessionToken == null || sessionToken.isBlank()) return null;
        return guestSessionRepository
                .findByLookupToken(sessionToken.trim())
                .orElse(null);
    }

    // ── Menu version (ETag + Last-Modified) ──

    private static final char[] HEX = "0123456789abcdef".toCharArray();
    public record MenuVersion(String etag, LocalDateTime lastModified) {}

    @Transactional(readOnly = true)
    public MenuVersion computeMenuVersion(Long restaurantId) {
        LocalDateTime dishMax = dishRepository.findMaxUpdatedAtByRestaurantId(restaurantId);
        LocalDateTime catMax = dishCategoryRepository.findMaxUpdatedAtByRestaurantId(restaurantId);
        LocalDateTime lastModified;
        if (dishMax == null) lastModified = catMax;
        else if (catMax == null) lastModified = dishMax;
        else lastModified = dishMax.isAfter(catMax) ? dishMax : catMax;

        long dE = dishMax != null ? dishMax.toEpochSecond(ZoneOffset.UTC) : 0L;
        long cE = catMax != null ? catMax.toEpochSecond(ZoneOffset.UTC) : 0L;
        String raw = restaurantId + ":" + dE + "." + (dishMax != null ? dishMax.getNano() : 0)
                + ":" + cE + "." + (catMax != null ? catMax.getNano() : 0);
        String etag;
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(18).append('"');
            for (int i = 0; i < 8; i++) { hex.append(HEX[(hash[i] >> 4) & 0x0f]).append(HEX[hash[i] & 0x0f]); }
            etag = hex.append('"').toString();
        } catch (NoSuchAlgorithmException e) { etag = "\"" + raw.hashCode() + "\""; }
        return new MenuVersion(etag, lastModified);
    }

    // ═══════════════════════════════════════════
    //  1. GET /api/public/menu
    // ═══════════════════════════════════════════

    @Transactional(readOnly = true)
    public List<PublicMenuCategoryDto> getMenu(Long restaurantId) {
        List<DishCategory> categories = dishCategoryRepository.findByRestaurantId(restaurantId);
        List<Dish> activeDishes = dishRepository.findByRestaurantIdAndCategoryId(restaurantId, null, true);

        List<Long> dishIds = activeDishes.stream().map(Dish::getId).toList();
        Map<Long, List<DishOptionGroup>> groupsByDish = loadGroupsByDishIds(dishIds);

        Map<Long, List<Dish>> byCat = activeDishes.stream()
                .filter(d -> d.getCategoryId() != null)
                .collect(Collectors.groupingBy(Dish::getCategoryId));

        List<PublicMenuCategoryDto> result = new ArrayList<>();
        for (DishCategory cat : categories) {
            List<Dish> dishes = byCat.getOrDefault(cat.getId(), List.of());
            if (dishes.isEmpty()) continue;
            result.add(new PublicMenuCategoryDto(cat.getId(), cat.getName(), cat.getImageUrl(),
                    dishes.stream().map(d -> toMenuItem(d, groupsByDish.getOrDefault(d.getId(), List.of()))).toList()));
        }
        List<Dish> uncategorized = activeDishes.stream().filter(d -> d.getCategoryId() == null).toList();
        if (!uncategorized.isEmpty()) {
            // Показываем небьющиеся по категориям блюда в отдельном блоке «Прочее»
            result.add(new PublicMenuCategoryDto(null, "Прочее", null,
                    uncategorized.stream().map(d -> toMenuItem(d, groupsByDish.getOrDefault(d.getId(), List.of()))).toList()));
        }
        return result;
    }

    private Map<Long, List<DishOptionGroup>> loadGroupsByDishIds(List<Long> dishIds) {
        if (dishIds.isEmpty()) return Map.of();
        List<DishOptionGroup> groups = dishOptionGroupRepository.findByDishIdInAndIsActiveTrueOrderBySortOrderAsc(dishIds);
        for (DishOptionGroup g : groups) {
            g.getTemplate().getItems().size(); // init lazy
        }
        Map<Long, List<DishOptionGroup>> raw = groups.stream().collect(Collectors.groupingBy(DishOptionGroup::getDishId));
        Map<Long, List<DishOptionGroup>> result = new HashMap<>();
        for (Map.Entry<Long, List<DishOptionGroup>> e : raw.entrySet()) {
            result.put(e.getKey(), dedupeDishGroupsByTemplateId(e.getValue()));
        }
        return result;
    }

    /** Одно вхождение шаблона на блюдо (защита от дубликатов строк в dish_option_groups). */
    private static List<DishOptionGroup> dedupeDishGroupsByTemplateId(List<DishOptionGroup> groups) {
        Map<Long, DishOptionGroup> byTemplate = new LinkedHashMap<>();
        for (DishOptionGroup g : groups) {
            Long tid = g.getTemplate().getId();
            if (!byTemplate.containsKey(tid)) {
                byTemplate.put(tid, g);
            }
        }
        return new ArrayList<>(byTemplate.values());
    }

    private PublicMenuCategoryDto.MenuItem toMenuItem(Dish d, List<DishOptionGroup> groups) {
        List<PublicMenuCategoryDto.OptionGroupDto> ogDtos = groups.stream().map(g -> {
            OptionGroupTemplate t = g.getTemplate();
            return new PublicMenuCategoryDto.OptionGroupDto(
                    g.getId(), t.getId(), t.getTitle(), t.getType().name(), t.getPresentation().name(),
                    new PublicMenuCategoryDto.RulesDto(
                            g.effectiveMinSelect(), g.effectiveMaxSelect(),
                            g.effectiveMinTotalQty(), g.effectiveMaxTotalQty(),
                            g.effectiveRangeMin(), g.effectiveRangeMax(),
                            t.getPricingMode() != null ? t.getPricingMode().name() : null,
                            g.effectivePricePerUnit(),
                            t.getAllowSameOptionTwice()),
                    t.getItems().stream().filter(OptionItemTemplate::getIsActive)
                            .map(oi -> new PublicMenuCategoryDto.OptionItemDto(
                                    oi.getId(), oi.getTitle(), oi.getPriceDelta(),
                                    oi.getPerOptionMaxQty(), oi.getValueInt(), oi.getIsDefault()))
                            .toList());
        }).toList();
        return new PublicMenuCategoryDto.MenuItem(d.getId(), d.getName(), d.getPrice(), d.getImageUrl(), ogDtos);
    }

    // ═══════════════════════════════════════════
    //  2. POST /api/public/sessions
    // ═══════════════════════════════════════════

    @Transactional
    public CreateSessionResponse createSession(Long restaurantId, Long tableId) {
        HallTable table = hallTableRepository.findById(tableId).orElse(null);
        if (table == null || !restaurantId.equals(table.getRestaurantId())) return null;
        GuestSession session = new GuestSession();
        session.setSessionToken(UUID.randomUUID().toString().replace("-", ""));
        session.setRestaurantId(restaurantId);
        session.setTableId(tableId);
        GuestSession saved = guestSessionRepository.save(session);
        return new CreateSessionResponse(saved.getSessionToken(), saved.getExpiresAt());
    }

    // ═══════════════════════════════════════════
    //  3. GET /api/public/orders/current
    // ═══════════════════════════════════════════

    @Transactional(readOnly = true)
    public OrderDto getCurrentOrder(GuestSession session) {
        List<Order> open = orderRepository.findOpenOrdersByTable(session.getRestaurantId(), session.getTableId());
        if (open.isEmpty()) return null;
        initOrderItems(open.get(0));
        return OrderDto.fromEntity(open.get(0));
    }

    // ═══════════════════════════════════════════
    //  4. POST /api/public/orders
    // ═══════════════════════════════════════════

    /**
     * Creates or returns the open QR order for this guest session. Serializes concurrent calls per session
     * (pessimistic lock). Optional {@code X-Idempotency-Key} maps to {@code orders.idempotency_key} (global unique),
     * same as POS — retries return the same order when the key matches this table/restaurant.
     */
    @Transactional
    public OrderDto createOrGetOrder(long guestSessionId, String idempotencyKeyHeader) {
        GuestSession session = guestSessionRepository.findByIdForUpdate(guestSessionId)
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Session not found"));
        if (session.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Invalid or expired guest session");
        }

        String normalizedKey = idempotencyKeyHeader != null && !idempotencyKeyHeader.isBlank()
                ? idempotencyKeyHeader.trim() : null;

        if (normalizedKey != null) {
            Optional<Order> byKey = orderRepository.findByIdempotencyKey(normalizedKey);
            if (byKey.isPresent()) {
                Order o = byKey.get();
                if (!session.getRestaurantId().equals(o.getRestaurant().getId())
                        || !Objects.equals(session.getTableId(),
                        o.getTable() != null ? o.getTable().getId() : null)) {
                    throw new OrderConflictException("Idempotency key already used for another order");
                }
                businessMetrics.incrementOrdersIdempotentReused();
                initOrderItems(o);
                return OrderDto.fromEntity(o);
            }
        }

        List<Order> open = orderRepository.findOpenOrdersByTable(session.getRestaurantId(), session.getTableId());
        if (!open.isEmpty()) {
            initOrderItems(open.get(0));
            return OrderDto.fromEntity(open.get(0));
        }
        HallTable table = hallTableRepository.findById(session.getTableId())
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Table not found"));
        Order order = new Order();
        order.setStatus(OrderStatus.OPEN);
        order.setCreatedBy("QR");
        order.setName("Table " + table.getLabel());
        order.setOrderSource(OrderSource.QR);
        order.setRestaurant(restaurantRepository.findById(session.getRestaurantId())
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Restaurant not found")));
        order.setTable(table);
        if (normalizedKey != null) {
            order.setIdempotencyKey(normalizedKey);
        }
        try {
            Order savedOrder = orderRepository.save(order);
            OrderDto created = OrderDto.fromEntity(savedOrder);
            businessMetrics.incrementOrdersCreated();
            HashMap<String, Object> audit = new HashMap<>();
            audit.put("channel", StructuredAudit.CHANNEL_QR);
            audit.put("guestSessionId", guestSessionId);
            audit.put("restaurantId", session.getRestaurantId());
            audit.put("entityType", "ORDER");
            audit.put("entityId", created.id());
            StructuredAudit.success(AuditActions.ORDER_CREATED, audit);
            return created;
        } catch (DataIntegrityViolationException ex) {
            if (normalizedKey != null) {
                return orderRepository.findByIdempotencyKey(normalizedKey)
                        .map(o -> {
                            if (!session.getRestaurantId().equals(o.getRestaurant().getId())
                                    || !Objects.equals(session.getTableId(),
                                    o.getTable() != null ? o.getTable().getId() : null)) {
                                throw new OrderConflictException("Idempotency key already used for another order");
                            }
                            businessMetrics.incrementOrdersIdempotentReused();
                            initOrderItems(o);
                            return OrderDto.fromEntity(o);
                        })
                        .orElseThrow(() -> ex);
            }
            throw ex;
        }
    }

    // ═══════════════════════════════════════════
    //  5. POST /api/public/orders/{orderId}/items
    // ═══════════════════════════════════════════

    @Transactional
    public OrderDto addItem(GuestSession session, Long orderId, AddPublicItemRequest req) {
        Order order = loadAndVerifyOrder(session, orderId);
        Dish dish = dishRepository.findById(req.dishId()).orElse(null);
        if (dish == null || !session.getRestaurantId().equals(dish.getRestaurantId()) || !Boolean.TRUE.equals(dish.getIsActive()))
            throw new com.restaurant.exception.ResourceNotFoundException("Dish not found or not available");

        String comment = req.comment() != null && !req.comment().trim().isEmpty() ? req.comment().trim() : null;
        List<OrderItemOption> snapshots = buildAndValidateOptions(dish.getId(), req.selections());
        boolean hasOpts = snapshots != null && !snapshots.isEmpty();

        OrderItem mergeTarget = null;
        if (!hasOpts) {
            mergeTarget = order.getItems().stream()
                    .filter(i -> i.getDish().getId().equals(req.dishId()))
                    .filter(i -> i.getOptions() == null || i.getOptions().isEmpty())
                    .filter(i -> Objects.equals(
                            i.getComment() != null && !i.getComment().trim().isEmpty() ? i.getComment().trim() : null, comment))
                    .findFirst().orElse(null);
        }

        orderStockCheckService.validateStockAfterAdd(order, dish, req.qty(), snapshots, mergeTarget);

        if (mergeTarget != null) {
            mergeTarget.setQty(mergeTarget.getQty() + req.qty());
            mergeTarget.calculateLineTotal();
            order.calculateTotalAmount();
            return OrderDto.fromEntity(orderRepository.save(order));
        }

        OrderItem item = new OrderItem();
        item.setOrder(order);
        item.setDish(dish);
        item.setQty(req.qty());
        item.setPriceAtTime(dish.getPrice());
        item.setComment(comment);
        if (hasOpts) { for (OrderItemOption o : snapshots) o.setOrderItem(item); item.setOptions(snapshots); }
        item.calculateLineTotal();
        order.getItems().add(item);
        order.calculateTotalAmount();
        return OrderDto.fromEntity(orderRepository.save(order));
    }

    // ═══════════════════════════════════════════
    //  Validation + Snapshot builder (all 8 types)
    // ═══════════════════════════════════════════

    /**
     * Validates selections against dish option groups. Returns snapshot objects.
     * Empty list when selections is null/empty (after checking for required groups).
     * Throws IllegalArgumentException (→ 400) on invalid input.
     *
     * RANGE_STEPPER pricing uses PER_UNIT mode: delta = pricePerUnit * valueInt.
     */
    public List<OrderItemOption> buildAndValidateOptions(Long dishId, List<AddPublicItemRequest.OptionSelection> selections) {
        List<DishOptionGroup> groups = dishOptionGroupRepository.findByDishIdAndIsActiveTrueOrderBySortOrderAsc(dishId);
        for (DishOptionGroup g : groups) g.getTemplate().getItems().size();
        groups = dedupeDishGroupsByTemplateId(groups);

        Map<Long, List<AddPublicItemRequest.OptionSelection>> selsByGroup = selections != null
                ? selections.stream().collect(Collectors.groupingBy(AddPublicItemRequest.OptionSelection::groupInstanceId))
                : Map.of();

        List<OrderItemOption> result = new ArrayList<>();

        for (DishOptionGroup g : groups) {
            OptionGroupTemplate t = g.getTemplate();
            OptionGroupType type = t.getType();
            List<AddPublicItemRequest.OptionSelection> gSels = selsByGroup.getOrDefault(g.getId(), List.of());
            Map<Long, OptionItemTemplate> itemMap = t.getItems().stream()
                    .filter(OptionItemTemplate::getIsActive)
                    .collect(Collectors.toMap(OptionItemTemplate::getId, i -> i));

            switch (type) {
                case SINGLE_REQUIRED -> {
                    if (gSels.size() != 1)
                        throw bad("'" + t.getTitle() + "': нужен ровно 1 выбор, получено " + gSels.size());
                    result.add(snapshotItem(g, gSels.get(0), itemMap));
                }
                case SINGLE_OPTIONAL -> {
                    if (gSels.size() > 1)
                        throw bad("'" + t.getTitle() + "': макс. 1 выбор");
                    if (gSels.size() == 1) result.add(snapshotItem(g, gSels.get(0), itemMap));
                }
                case MULTI -> {
                    int maxS = g.effectiveMaxSelect() != null ? g.effectiveMaxSelect() : Integer.MAX_VALUE;
                    if (gSels.size() > maxS) throw bad("'" + t.getTitle() + "': макс. " + maxS + " выборов");
                    for (var s : gSels) result.add(snapshotItem(g, s, itemMap));
                }
                case MULTI_REQUIRED -> {
                    int minS = g.effectiveMinSelect() != null ? g.effectiveMinSelect() : 1;
                    int maxS = g.effectiveMaxSelect() != null ? g.effectiveMaxSelect() : Integer.MAX_VALUE;
                    if (gSels.size() < minS) throw bad("'" + t.getTitle() + "': мин. " + minS + " выборов");
                    if (gSels.size() > maxS) throw bad("'" + t.getTitle() + "': макс. " + maxS + " выборов");
                    for (var s : gSels) result.add(snapshotItem(g, s, itemMap));
                }
                case MULTI_QTY_TOTAL_LIMIT, HALF_AND_HALF -> {
                    int totalQty = 0;
                    Set<Long> seenOpts = new HashSet<>();
                    for (var s : gSels) {
                        validateOptionBelongs(s, itemMap, t.getTitle());
                        int oq = s.optionQty() != null && s.optionQty() > 0 ? s.optionQty() : 1;
                        if (type == OptionGroupType.HALF_AND_HALF && !Boolean.TRUE.equals(t.getAllowSameOptionTwice())) {
                            if (!seenOpts.add(s.optionItemId()))
                                throw bad("'" + t.getTitle() + "': нельзя выбрать одну опцию дважды");
                        }
                        totalQty += oq;
                        OptionItemTemplate oi = itemMap.get(s.optionItemId());
                        if (oi.getPerOptionMaxQty() != null && oq > oi.getPerOptionMaxQty())
                            throw bad("'" + oi.getTitle() + "': макс. qty " + oi.getPerOptionMaxQty());
                        result.add(snapshotFromItem(g, oi, oq));
                    }
                    int minTQ = g.effectiveMinTotalQty() != null ? g.effectiveMinTotalQty() : 0;
                    int maxTQ = g.effectiveMaxTotalQty() != null ? g.effectiveMaxTotalQty() : Integer.MAX_VALUE;
                    if (totalQty < minTQ) throw bad("'" + t.getTitle() + "': мин. общее кол-во " + minTQ + ", выбрано " + totalQty);
                    if (totalQty > maxTQ) throw bad("'" + t.getTitle() + "': макс. общее кол-во " + maxTQ + ", выбрано " + totalQty);
                }
                case RANGE_STEPPER -> {
                    if (gSels.size() != 1 || gSels.get(0).valueInt() == null)
                        throw bad("'" + t.getTitle() + "': нужно выбрать значение");
                    int val = gSels.get(0).valueInt();
                    int rMin = g.effectiveRangeMin() != null ? g.effectiveRangeMin() : 0;
                    int rMax = g.effectiveRangeMax() != null ? g.effectiveRangeMax() : Integer.MAX_VALUE;
                    if (val < rMin || val > rMax)
                        throw bad("'" + t.getTitle() + "': значение должно быть " + rMin + "–" + rMax);
                    BigDecimal delta = BigDecimal.ZERO;
                    String optTitle = t.getTitle() + ": " + val;
                    if (t.getPricingMode() == OptionGroupTemplate.PricingMode.LOOKUP) {
                        OptionItemTemplate match = t.getItems().stream()
                                .filter(oi -> oi.getIsActive() && oi.getValueInt() != null && oi.getValueInt() == val)
                                .findFirst().orElse(null);
                        if (match != null) {
                            delta = match.getPriceDelta() != null ? match.getPriceDelta() : BigDecimal.ZERO;
                            optTitle = match.getTitle();
                        }
                    } else {
                        BigDecimal ppu = g.effectivePricePerUnit() != null ? g.effectivePricePerUnit() : BigDecimal.ZERO;
                        delta = ppu.multiply(BigDecimal.valueOf(val)).setScale(2, RoundingMode.HALF_UP);
                    }
                    OrderItemOption snap = new OrderItemOption();
                    snap.setTemplateId(t.getId());
                    snap.setGroupTitleSnapshot(t.getTitle());
                    snap.setOptionTitleSnapshot(optTitle);
                    snap.setPriceDeltaSnapshot(delta);
                    snap.setOptionQty(1);
                    snap.setValueIntSnapshot(val);
                    result.add(snap);
                }
                case EXCLUSIONS -> {
                    int maxS = g.effectiveMaxSelect() != null ? g.effectiveMaxSelect() : Integer.MAX_VALUE;
                    if (gSels.size() > maxS) throw bad("'" + t.getTitle() + "': макс. " + maxS + " исключений");
                    for (var s : gSels) {
                        validateOptionBelongs(s, itemMap, t.getTitle());
                        OptionItemTemplate oi = itemMap.get(s.optionItemId());
                        OrderItemOption snap = new OrderItemOption();
                        snap.setTemplateId(t.getId());
                        snap.setOptionItemTemplateId(oi.getId());
                        snap.setGroupTitleSnapshot(t.getTitle());
                        snap.setOptionTitleSnapshot(oi.getTitle());
                        snap.setPriceDeltaSnapshot(BigDecimal.ZERO);
                        snap.setOptionQty(1);
                        result.add(snap);
                    }
                }
            }
        }
        return result;
    }

    private OrderItemOption snapshotItem(DishOptionGroup g, AddPublicItemRequest.OptionSelection sel,
                                         Map<Long, OptionItemTemplate> itemMap) {
        validateOptionBelongs(sel, itemMap, g.getTemplate().getTitle());
        OptionItemTemplate oi = itemMap.get(sel.optionItemId());
        return snapshotFromItem(g, oi, 1);
    }

    private OrderItemOption snapshotFromItem(DishOptionGroup g, OptionItemTemplate oi, int optionQty) {
        OrderItemOption snap = new OrderItemOption();
        snap.setTemplateId(g.getTemplate().getId());
        snap.setOptionItemTemplateId(oi.getId());
        snap.setGroupTitleSnapshot(g.getTemplate().getTitle());
        snap.setOptionTitleSnapshot(oi.getTitle());
        snap.setPriceDeltaSnapshot(oi.getPriceDelta());
        snap.setOptionQty(optionQty);
        return snap;
    }

    private void validateOptionBelongs(AddPublicItemRequest.OptionSelection sel,
                                       Map<Long, OptionItemTemplate> itemMap, String groupTitle) {
        if (sel.optionItemId() == null || !itemMap.containsKey(sel.optionItemId()))
            throw bad("'" + groupTitle + "': недопустимая опция " + sel.optionItemId());
    }

    private static IllegalArgumentException bad(String msg) { return new IllegalArgumentException(msg); }

    // ═══════════════════════════════════════════
    //  6. DELETE /api/public/orders/{orderId}/items/{itemId}
    // ═══════════════════════════════════════════

    @Transactional
    public OrderDto removeItem(GuestSession session, Long orderId, Long itemId) {
        Order order = loadAndVerifyOrder(session, orderId);
        if (!order.getItems().removeIf(i -> i.getId().equals(itemId)))
            throw new com.restaurant.exception.ResourceNotFoundException("Order item not found");
        order.calculateTotalAmount();
        return OrderDto.fromEntity(orderRepository.save(order));
    }

    // ── internal ──

    private Order loadAndVerifyOrder(GuestSession session, Long orderId) {
        Order order = orderRepository.findByIdWithItemsOptions(orderId)
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Order not found"));
        if (!session.getRestaurantId().equals(order.getRestaurantId()))
            throw new AccessDeniedException("Order does not belong to this restaurant");
        if (!session.getTableId().equals(order.getTableId()))
            throw new AccessDeniedException("Order does not belong to this table");
        if (order.getStatus() != OrderStatus.OPEN)
            throw new OrderConflictException("Order is not open");
        initOrderItems(order);
        return order;
    }

    private void initOrderItems(Order order) {
        order.getItems().size();
        for (OrderItem item : order.getItems()) {
            item.getDish().getName();
            if (item.getOptions() != null) item.getOptions().size();
        }
    }

    public static class AccessDeniedException extends RuntimeException implements com.restaurant.exception.HasApiErrorCode {
        private final String apiErrorCode;

        public AccessDeniedException(String msg) {
            this(msg, "PUBLIC_ORDERING_ACCESS_DENIED");
        }

        public AccessDeniedException(String msg, String apiErrorCode) {
            super(msg);
            this.apiErrorCode = apiErrorCode;
        }

        @Override
        public String getApiErrorCode() {
            return apiErrorCode;
        }
    }

    public static class OrderConflictException extends RuntimeException implements com.restaurant.exception.HasApiErrorCode {
        private final String apiErrorCode;

        public OrderConflictException(String msg) {
            this(msg, "ORDER_CONFLICT");
        }

        public OrderConflictException(String msg, String apiErrorCode) {
            super(msg);
            this.apiErrorCode = apiErrorCode;
        }

        @Override
        public String getApiErrorCode() {
            return apiErrorCode;
        }
    }
}
