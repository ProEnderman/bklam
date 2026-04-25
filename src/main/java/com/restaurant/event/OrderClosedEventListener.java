package com.restaurant.event;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * No longer processes loyalty directly. Outbox is the single source of truth:
 * OrderService.closeOrder() writes to outbox_events; OutboxDispatcherService
 * processes ORDER_CLOSED and calls CampaignEngine. This listener is kept only
 * for any other side effects (e.g. metrics) or can be removed.
 */
@Slf4j
@Component
public class OrderClosedEventListener {

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onOrderClosed(OrderClosedEvent event) {
        log.debug("Order closed event: orderId={} restaurantId={} (loyalty handled via outbox)",
            event.orderId(), event.restaurantId());
    }
}
