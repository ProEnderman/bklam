package com.restaurant.service;

import com.restaurant.dto.AddOrderItemRequest;
import com.restaurant.dto.CreateOrderSplitRequest;
import com.restaurant.dto.DemoOrderSeedResult;
import com.restaurant.dto.OrderDto;
import com.restaurant.exception.BusinessException;
import com.restaurant.model.Dish;
import com.restaurant.model.HallTable;
import com.restaurant.model.Ingredient;
import com.restaurant.model.Order;
import com.restaurant.model.OrderItem;
import com.restaurant.model.OrderSource;
import com.restaurant.model.Restaurant;
import com.restaurant.model.loyalty.Guest;
import com.restaurant.repository.DishIngredientRepository;
import com.restaurant.repository.DishRepository;
import com.restaurant.repository.HallTableRepository;
import com.restaurant.repository.IngredientRepository;
import com.restaurant.repository.OrderRepository;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.loyalty.GuestRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Generates realistic closed/paid orders for analytics demos (local/staging only).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DemoOrderSeedService {

    private static final double SEED_STOCK_QTY = 5_000_000.0;
    private static final int BATCH_SIZE = 40;

    private final OrderService orderService;
    private final SplitBillService splitBillService;
    private final StockService stockService;
    private final DishRepository dishRepository;
    private final DishIngredientRepository dishIngredientRepository;
    private final IngredientRepository ingredientRepository;
    private final GuestRepository guestRepository;
    private final HallTableRepository hallTableRepository;
    private final RestaurantRepository restaurantRepository;
    private final OrderRepository orderRepository;
    private final TransactionTemplate transactionTemplate;

    @Value("${demo.order-seed.enabled:false}")
    private boolean enabled;

    public DemoOrderSeedResult seedOrders(int count, int daysBack) {
        if (!enabled) {
            throw new BusinessException(
                "Demo order seed is disabled. Set DEMO_ORDER_SEED_ENABLED=true (or demo.order-seed.enabled=true).");
        }
        if (!SecurityUtils.isAdmin() && !SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("Only ADMIN or HEAD_ADMIN can seed demo orders");
        }
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) {
            throw new BusinessException("Restaurant context is required (use ?restaurantId= for HEAD_ADMIN)");
        }
        if (count < 1 || count > 5000) {
            throw new BusinessException("count must be between 1 and 5000");
        }
        if (daysBack < 1 || daysBack > 730) {
            throw new BusinessException("daysBack must be between 1 and 730");
        }

        SeedContext ctx = transactionTemplate.execute(status -> prepareContext(restaurantId));
        if (ctx == null || ctx.dishes().isEmpty()) {
            throw new BusinessException(
                "No active dishes with recipes found. Add menu items and ingredient recipes first.");
        }

        int created = 0;
        int closed = 0;
        int paid = 0;
        int split = 0;
        int guestsCreated = 0;
        ThreadLocalRandom rnd = ThreadLocalRandom.current();
        LocalDateTime now = LocalDateTime.now();

        for (int offset = 0; offset < count; offset += BATCH_SIZE) {
            int batch = Math.min(BATCH_SIZE, count - offset);
            int[] stats = transactionTemplate.execute(status -> seedBatch(ctx, batch, daysBack, now, rnd));
            if (stats == null) {
                continue;
            }
            created += stats[0];
            closed += stats[1];
            paid += stats[2];
            split += stats[3];
            guestsCreated += stats[4];
        }

        String msg = String.format(
            "Created %d orders (%d closed, %d paid, %d with split, %d new guests) over last %d days",
            created, closed, paid, split, guestsCreated, daysBack);
        log.info("Demo order seed for restaurant {}: {}", restaurantId, msg);
        return new DemoOrderSeedResult(created, closed, paid, split, guestsCreated, ctx.ingredientsStocked(), msg);
    }

    private record SeedContext(
        Long restaurantId,
        List<Dish> dishes,
        List<HallTable> tables,
        List<Guest> guests,
        int ingredientsStocked
    ) {}

    private SeedContext prepareContext(Long restaurantId) {
        List<Dish> allActive = dishRepository.searchDishes(
            restaurantId, null, true, PageRequest.of(0, 10_000)).getContent();
        List<Dish> withRecipe = new ArrayList<>();
        for (Dish d : allActive) {
            if (!dishIngredientRepository.findByDishId(d.getId()).isEmpty()) {
                withRecipe.add(d);
            }
        }
        List<HallTable> tables = hallTableRepository.findByRestaurantIdOrderByLabelAsc(restaurantId);
        List<Guest> guests = new ArrayList<>(
            guestRepository.findByRestaurantId(restaurantId, PageRequest.of(0, 5_000)).getContent());
        ensureGuestPool(restaurantId, guests, 150);

        int stocked = ensureIngredientStock(restaurantId);
        return new SeedContext(restaurantId, withRecipe, tables, guests, stocked);
    }

    /** Pre-create loyalty guests so analytics show a real client base, not only anonymous tabs. */
    private int ensureGuestPool(Long restaurantId, List<Guest> guests, int targetMin) {
        if (guests.size() >= targetMin) {
            return 0;
        }
        int need = targetMin - guests.size();
        ThreadLocalRandom rnd = ThreadLocalRandom.current();
        Set<String> phones = new HashSet<>();
        for (Guest g : guests) {
            if (g.getPhoneNormalized() != null) {
                phones.add(g.getPhoneNormalized());
            }
        }
        int created = 0;
        for (int i = 0; i < need; i++) {
            String phone;
            int attempts = 0;
            do {
                phone = "+79" + String.format("%09d", rnd.nextInt(1_000_000_000));
            } while (phones.contains(phone) && ++attempts < 20);
            phones.add(phone);
            Guest g = createRandomGuest(restaurantId, rnd, phone);
            guests.add(g);
            created++;
        }
        return created;
    }

    private int ensureIngredientStock(Long restaurantId) {
        int n = 0;
        List<Ingredient> ingredients = ingredientRepository.searchIngredients(
            restaurantId, null, "false", PageRequest.of(0, 50_000)).getContent();
        for (Ingredient ing : ingredients) {
            double current = ing.getStockQty() != null ? ing.getStockQty() : 0.0;
            if (current < 100_000) {
                double add = SEED_STOCK_QTY - current;
                stockService.stockIn(new com.restaurant.dto.StockInRequest(
                    ing.getId(), add, "Demo order seed — bulk stock"));
                n++;
            }
        }
        return n;
    }

  private int[] seedBatch(SeedContext ctx, int batchSize, int daysBack, LocalDateTime now, ThreadLocalRandom rnd) {
        int created = 0;
        int closed = 0;
        int paid = 0;
        int splitCount = 0;
        int guestsCreated = 0;
        OrderSource[] sources = {
            OrderSource.POS, OrderSource.POS, OrderSource.POS, OrderSource.QR, OrderSource.TELEGRAM, OrderSource.WEB
        };

        for (int i = 0; i < batchSize; i++) {
            if (rnd.nextDouble() < 0.04) {
                continue; // quiet hour — fewer orders
            }

            GuestPick guestPick = pickGuest(ctx, rnd);
            Long guestId = guestPick.guestId();
            guestsCreated += guestPick.newGuest() ? 1 : 0;

            // Mostly hall tables (realistic dine-in); no fake "Доставка/Бар" order titles.
            Long tableId = null;
            if (!ctx.tables().isEmpty() && rnd.nextDouble() < 0.82) {
                tableId = ctx.tables().get(rnd.nextInt(ctx.tables().size())).getId();
            }

            String name = null;
            OrderSource source = sources[rnd.nextInt(sources.length)];

            OrderDto orderDto = orderService.createOrder(name, tableId, guestId, null, source.name());
            Long orderId = orderDto.id();
            created++;

            int itemCount = 1 + rnd.nextInt(Math.min(7, ctx.dishes().size()));
            List<Dish> picked = pickDishes(ctx.dishes(), itemCount, rnd);
            for (Dish dish : picked) {
                int qty = 1 + rnd.nextInt(3);
                orderService.addItemToOrder(orderId, new AddOrderItemRequest(dish.getId(), qty, null, null));
            }

            if (rnd.nextDouble() < 0.28) {
                try {
                    createRandomSplit(orderId, rnd);
                    splitCount++;
                } catch (Exception e) {
                    log.debug("Split skipped for order {}: {}", orderId, e.getMessage());
                }
            }

            orderService.closeOrder(orderId);
            closed++;

            orderService.markOrderPaid(orderId);
            paid++;

            LocalDateTime createdAt = randomPastTimeInServiceHours(now, daysBack, rnd);
            LocalDateTime serviceEnd = createdAt.toLocalDate().plusDays(1).atStartOfDay().plusMinutes(30);
            LocalDateTime closedAt = createdAt.plusMinutes(15 + rnd.nextInt(150));
            if (closedAt.isAfter(serviceEnd)) {
                closedAt = serviceEnd.minusMinutes(1 + rnd.nextInt(25));
            }
            LocalDateTime paidAt = closedAt.plusMinutes(1 + rnd.nextInt(20));
            if (paidAt.isAfter(serviceEnd.plusMinutes(15))) {
                paidAt = serviceEnd.plusMinutes(1 + rnd.nextInt(14));
            }
            patchOrderTimestamps(orderId, createdAt, closedAt, paidAt);
        }
        return new int[] { created, closed, paid, splitCount, guestsCreated };
    }

    private void patchOrderTimestamps(Long orderId, LocalDateTime createdAt, LocalDateTime closedAt, LocalDateTime paidAt) {
        orderRepository.updateOrderTimestamps(orderId, createdAt, closedAt, paidAt);
    }

    /** Restaurant service window: 12:00 inclusive through 00:00 (midnight) exclusive. */
    private static final int SERVICE_OPEN_HOUR = 12;
    private static final int SERVICE_HOURS = 12;

    private LocalDateTime randomPastTimeInServiceHours(LocalDateTime now, int daysBack, ThreadLocalRandom rnd) {
        LocalDate day = now.toLocalDate().minusDays(rnd.nextInt(daysBack));
        int minuteOfService = rnd.nextInt(SERVICE_HOURS * 60);
        return day.atTime(SERVICE_OPEN_HOUR, 0).plusMinutes(minuteOfService).withSecond(0).withNano(0);
    }

    private record GuestPick(Long guestId, boolean newGuest) {}

    private GuestPick pickGuest(SeedContext ctx, ThreadLocalRandom rnd) {
        if (rnd.nextDouble() > 0.88) {
            return new GuestPick(null, false);
        }
        if (!ctx.guests().isEmpty() && rnd.nextDouble() < 0.62) {
            return new GuestPick(ctx.guests().get(rnd.nextInt(ctx.guests().size())).getId(), false);
        }
        String phone = "+79" + String.format("%09d", rnd.nextInt(1_000_000_000));
        Guest g = createRandomGuest(ctx.restaurantId(), rnd, phone);
        ctx.guests().add(g);
        return new GuestPick(g.getId(), true);
    }

    private Guest createRandomGuest(Long restaurantId, ThreadLocalRandom rnd, String phoneNormalized) {
        Restaurant restaurant = restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new BusinessException("Restaurant not found"));
        Guest guest = new Guest();
        guest.setRestaurant(restaurant);
        guest.setPhoneNormalized(phoneNormalized);
        guest.setName(randomGuestName(rnd));
        return guestRepository.save(guest);
    }

    private static String randomGuestName(ThreadLocalRandom rnd) {
        String[] first = { "Алексей", "Мария", "Иван", "Елена", "Дмитрий", "Анна", "Сергей", "Ольга", "Павел", "Наталья" };
        String[] last = { "Иванов", "Петрова", "Сидоров", "Козлова", "Новиков", "Морозова", "Волков", "Соколова" };
        return first[rnd.nextInt(first.length)] + " " + last[rnd.nextInt(last.length)];
    }

    private static List<Dish> pickDishes(List<Dish> pool, int count, ThreadLocalRandom rnd) {
        List<Dish> copy = new ArrayList<>(pool);
        Collections.shuffle(copy, rnd);
        return copy.subList(0, Math.min(count, copy.size()));
    }

    /**
     * Split like in a real restaurant: each line item goes to one guest (different dishes per person).
     * Only when a single line has qty &gt; 1 and several guests, that line is divided by quantity.
     */
    private void createRandomSplit(Long orderId, ThreadLocalRandom rnd) {
        Order order = orderRepository.findByIdWithItemsOptions(orderId)
            .orElseThrow(() -> new BusinessException("Order not found"));
        List<OrderItem> lines = new ArrayList<>(order.getItems());
        if (lines.isEmpty()) {
            return;
        }

        int party = Math.min(2 + rnd.nextInt(4), Math.max(2, lines.size()));
        List<List<CreateOrderSplitRequest.ItemQty>> perGuest = new ArrayList<>();
        for (int g = 0; g < party; g++) {
            perGuest.add(new ArrayList<>());
        }

        List<OrderItem> shuffled = new ArrayList<>(lines);
        Collections.shuffle(shuffled, rnd);

        if (shuffled.size() == 1 && shuffled.get(0).getQty() > 1 && party > 1) {
            OrderItem only = shuffled.get(0);
            int[] parts = splitQuantity(only.getQty(), party, rnd);
            for (int g = 0; g < party; g++) {
                if (parts[g] > 0) {
                    perGuest.get(g).add(new CreateOrderSplitRequest.ItemQty(only.getId(), parts[g]));
                }
            }
        } else {
            int guestCursor = 0;
            for (OrderItem item : shuffled) {
                int g = guestCursor % party;
                guestCursor++;
                perGuest.get(g).add(new CreateOrderSplitRequest.ItemQty(item.getId(), item.getQty()));
            }
        }

        List<CreateOrderSplitRequest.ShareRequest> shares = new ArrayList<>();
        int idx = 1;
        for (List<CreateOrderSplitRequest.ItemQty> items : perGuest) {
            if (items.isEmpty()) {
                continue;
            }
            Long shareGuestId = null;
            if (order.getGuest() != null && idx == 1) {
                shareGuestId = order.getGuest().getId();
            }
            shares.add(new CreateOrderSplitRequest.ShareRequest("Гость " + idx++, items, shareGuestId));
        }
        if (shares.size() < 2) {
            return;
        }
        splitBillService.createSplit(orderId, new CreateOrderSplitRequest(shares));
    }

    /** Random partition of {@code total} into {@code parts} positive ints summing to total. */
    private static int[] splitQuantity(int total, int parts, ThreadLocalRandom rnd) {
        int[] result = new int[parts];
        if (total <= 0 || parts <= 0) {
            return result;
        }
        if (parts == 1) {
            result[0] = total;
            return result;
        }
        int remaining = total;
        for (int i = 0; i < parts - 1; i++) {
            int slotsLeft = parts - i;
            int max = remaining - (slotsLeft - 1);
            int part = max <= 0 ? 0 : (max == 1 ? 1 : 1 + rnd.nextInt(max));
            result[i] = part;
            remaining -= part;
        }
        result[parts - 1] = remaining;
        return result;
    }
}
