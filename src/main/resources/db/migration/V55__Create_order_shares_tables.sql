-- Split Bill: order_shares + order_share_items
-- Allows splitting an OPEN order's items into named shares for separate billing.

CREATE TABLE order_shares (
    id          BIGSERIAL       PRIMARY KEY,
    order_id    BIGINT          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    name        VARCHAR(64)     NOT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_shares_order_id ON order_shares(order_id);

CREATE TABLE order_share_items (
    share_id        BIGINT NOT NULL REFERENCES order_shares(id) ON DELETE CASCADE,
    order_item_id   BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    PRIMARY KEY (share_id, order_item_id)
);

-- Each order item can belong to at most one share (strict partition).
CREATE UNIQUE INDEX uq_order_share_items_order_item_id ON order_share_items(order_item_id);
