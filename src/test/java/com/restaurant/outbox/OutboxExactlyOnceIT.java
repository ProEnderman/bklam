package com.restaurant.outbox;

import com.restaurant.model.LoyaltyOrderAccrual;
import com.restaurant.model.OutboxEvent;
import com.restaurant.repository.LoyaltyOrderAccrualRepository;
import com.restaurant.repository.OutboxEventRepository;
import com.restaurant.service.OutboxDispatcherService;
import com.restaurant.service.loyalty.CampaignEngine;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Integration tests for outbox exactly-once processing with claim-lock semantics.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
@Testcontainers
class OutboxExactlyOnceIT {

    @Container
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16")
            .withDatabaseName("restaurant_db")
            .withUsername("postgres")
            .withPassword("postgres");

    @DynamicPropertySource
    static void registerPg(DynamicPropertyRegistry registry) {
        String jdbcUrl = pg.getJdbcUrl();
        registry.add("spring.datasource.url", () -> jdbcUrl);
        registry.add("spring.datasource.username", pg::getUsername);
        registry.add("spring.datasource.password", pg::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("app.datasource.tenant.jdbc-url", () -> jdbcUrl);
        registry.add("app.datasource.tenant.username", pg::getUsername);
        registry.add("app.datasource.tenant.password", pg::getPassword);
        registry.add("app.datasource.tenant.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("app.datasource.platform.jdbc-url", () -> jdbcUrl);
        registry.add("app.datasource.platform.username", pg::getUsername);
        registry.add("app.datasource.platform.password", pg::getPassword);
        registry.add("app.datasource.platform.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.properties.hibernate.dialect", () -> "org.hibernate.dialect.PostgreSQLDialect");
    }

    @Autowired
    private OutboxEventRepository outboxEventRepository;
    @Autowired
    private LoyaltyOrderAccrualRepository accrualGuardRepository;
    @SpyBean
    private CampaignEngine campaignEngine;
    @Autowired
    private OutboxDispatcherService dispatcherService;

    private OutboxEvent event;
    private static final Long RESTAURANT_ID = 1L;
    private static final Long ORDER_ID = 100L;

    @BeforeEach
    void setUp() {
        clearInvocations(campaignEngine);
        accrualGuardRepository.deleteAll();
        outboxEventRepository.deleteAll();
        event = createEvent(ORDER_ID, 1L, "50.00", 10L);
        outboxEventRepository.save(event);
    }

    @Test
    void retrySucceedsAndGuardMarkedProcessedWithoutDuplicateProcessing() {
        doThrow(new RuntimeException("Simulated failure"))
                .doNothing()
                .when(campaignEngine).processOrderEvent(anyLong(), anyLong(), any(BigDecimal.class), anyLong());

        dispatcherService.processOutbox();
        OutboxEvent afterFirst = outboxEventRepository.findById(event.getId()).orElseThrow();
        assertThat(afterFirst.getStatus()).isEqualTo(OutboxEvent.STATUS_RETRY);
        assertThat(afterFirst.getAttempts()).isEqualTo(1);
        assertThat(accrualGuardRepository.existsByRestaurantIdAndOrderIdAndStatus(
                RESTAURANT_ID, ORDER_ID, LoyaltyOrderAccrual.STATUS_PROCESSED)).isFalse();

        afterFirst.setNextAttemptAt(Instant.now());
        outboxEventRepository.save(afterFirst);
        dispatcherService.processOutbox();

        OutboxEvent afterSecond = outboxEventRepository.findById(event.getId()).orElseThrow();
        assertThat(afterSecond.getStatus()).isEqualTo(OutboxEvent.STATUS_DONE);
        assertThat(accrualGuardRepository.existsByRestaurantIdAndOrderIdAndStatus(
                RESTAURANT_ID, ORDER_ID, LoyaltyOrderAccrual.STATUS_PROCESSED)).isTrue();
        verify(campaignEngine, times(2)).processOrderEvent(
                anyLong(), eq(ORDER_ID), any(BigDecimal.class), eq(RESTAURANT_ID));
    }

    // Two outbox rows for the same (restaurant, order): only one loyalty apply (idempotent consumer).
    @Test
    void twoOutboxEventsForSameOrder_callCampaignEngineOnce() {
        outboxEventRepository.deleteAll();
        accrualGuardRepository.deleteAll();
        OutboxEvent e1 = createEvent(ORDER_ID, 1L, "50.00", 10L);
        e1.setId(UUID.randomUUID());
        OutboxEvent e2 = createEvent(ORDER_ID, 1L, "50.00", 10L);
        e2.setId(UUID.randomUUID());
        outboxEventRepository.save(e1);
        outboxEventRepository.save(e2);
        dispatcherService.processOutbox();
        assertThat(outboxEventRepository.countByStatus(OutboxEvent.STATUS_DONE)).isEqualTo(2);
        verify(campaignEngine, times(1)).processOrderEvent(
                eq(10L), eq(ORDER_ID), any(BigDecimal.class), eq(RESTAURANT_ID));
    }

    /**
     * Verifies that concurrent processOutbox() calls from 2+ workers do not
     * cause duplicate event handling thanks to FOR UPDATE SKIP LOCKED.
     */
    @Test
    void concurrentDispatchersDoNotDuplicateProcessing() throws Exception {
        outboxEventRepository.deleteAll();
        accrualGuardRepository.deleteAll();

        int eventCount = 10;
        for (int i = 0; i < eventCount; i++) {
            OutboxEvent ev = createEvent(200L + i, 1L, "100.00", 10L);
            outboxEventRepository.save(ev);
        }

        List<Long> processedOrderIds = Collections.synchronizedList(new ArrayList<>());
        doAnswer(invocation -> {
            Long orderId = invocation.getArgument(1);
            processedOrderIds.add(orderId);
            Thread.sleep(50);
            return null;
        }).when(campaignEngine).processOrderEvent(anyLong(), anyLong(), any(BigDecimal.class), anyLong());

        int workerCount = 4;
        ExecutorService executor = Executors.newFixedThreadPool(workerCount);
        CountDownLatch startGate = new CountDownLatch(1);
        List<Future<?>> futures = new ArrayList<>();

        for (int w = 0; w < workerCount; w++) {
            futures.add(executor.submit(() -> {
                try {
                    startGate.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                dispatcherService.processOutbox();
            }));
        }

        startGate.countDown();

        for (Future<?> f : futures) {
            f.get(30, TimeUnit.SECONDS);
        }
        executor.shutdown();

        long doneCount = outboxEventRepository.countByStatus(OutboxEvent.STATUS_DONE);
        assertThat(doneCount).isEqualTo(eventCount);

        assertThat(processedOrderIds).hasSize(eventCount);
        assertThat(processedOrderIds).doesNotHaveDuplicates();
    }

    /**
     * Verifies that events stuck in PROCESSING beyond the threshold are recovered to RETRY.
     */
    @Test
    void stuckProcessingEventsAreRecovered() {
        outboxEventRepository.deleteAll();

        OutboxEvent stuck = createEvent(300L, 1L, "75.00", 10L);
        stuck.setStatus(OutboxEvent.STATUS_PROCESSING);
        stuck.setClaimedBy("dead-worker");
        stuck.setClaimedAt(Instant.now().minus(java.time.Duration.ofMinutes(10)));
        outboxEventRepository.save(stuck);

        dispatcherService.recoverStuckProcessing();

        OutboxEvent recovered = outboxEventRepository.findById(stuck.getId()).orElseThrow();
        assertThat(recovered.getStatus()).isEqualTo(OutboxEvent.STATUS_RETRY);
    }

    private OutboxEvent createEvent(Long orderId, Long restaurantId, String amount, Long guestId) {
        OutboxEvent ev = new OutboxEvent();
        ev.setId(UUID.randomUUID());
        ev.setAggregateType(OutboxEvent.AGGREGATE_ORDER);
        ev.setAggregateId(orderId);
        ev.setEventType(OutboxEvent.EVENT_ORDER_CLOSED);
        ev.setPayload(String.format(
                "{\"restaurantId\":%d,\"totalAmount\":\"%s\",\"guestId\":%d}",
                restaurantId, amount, guestId));
        ev.setStatus(OutboxEvent.STATUS_NEW);
        ev.setAttempts(0);
        ev.setNextAttemptAt(Instant.now());
        ev.setCreatedAt(Instant.now());
        return ev;
    }
}
