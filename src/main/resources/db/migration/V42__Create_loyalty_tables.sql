-- =============================================
-- Loyalty Platform — full schema
-- =============================================

-- 1. Guests (CRM-lite)
CREATE TABLE IF NOT EXISTS loyalty_guests (
    id              BIGSERIAL PRIMARY KEY,
    restaurant_id   BIGINT NOT NULL REFERENCES restaurants(id),
    phone_normalized VARCHAR(20) NOT NULL,
    name            VARCHAR(255),
    email           VARCHAR(255),
    birthday        DATE,
    consent_flags   JSONB DEFAULT '{}',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (restaurant_id, phone_normalized)
);
CREATE INDEX idx_loyalty_guests_phone ON loyalty_guests(phone_normalized);
CREATE INDEX idx_loyalty_guests_restaurant ON loyalty_guests(restaurant_id);

-- 2. Guest aliases (for merge / dedup)
CREATE TABLE IF NOT EXISTS loyalty_guest_aliases (
    id              BIGSERIAL PRIMARY KEY,
    primary_guest_id BIGINT NOT NULL REFERENCES loyalty_guests(id),
    alias_phone     VARCHAR(20) NOT NULL,
    merged_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (alias_phone)
);
CREATE INDEX idx_loyalty_guest_aliases_primary ON loyalty_guest_aliases(primary_guest_id);

-- 3. Bonus accounts
CREATE TABLE IF NOT EXISTS loyalty_bonus_accounts (
    id              BIGSERIAL PRIMARY KEY,
    guest_id        BIGINT NOT NULL UNIQUE REFERENCES loyalty_guests(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    current_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Bonus ledger (immutable append-only log)
CREATE TABLE IF NOT EXISTS loyalty_bonus_ledger (
    id              BIGSERIAL PRIMARY KEY,
    account_id      BIGINT NOT NULL REFERENCES loyalty_bonus_accounts(id),
    entry_type      VARCHAR(20) NOT NULL, -- EARN, BURN, EXPIRE, ADJUST
    amount          NUMERIC(12,2) NOT NULL,
    points_unit     VARCHAR(20) NOT NULL DEFAULT 'POINTS',
    source_type     VARCHAR(40),          -- ORDER, CAMPAIGN, MANUAL, REFERRAL
    source_id       VARCHAR(100),         -- order_id / campaign_id / etc.
    idempotency_key VARCHAR(200) UNIQUE,  -- prevents double-processing
    metadata        JSONB DEFAULT '{}',
    description     VARCHAR(500),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loyalty_ledger_account ON loyalty_bonus_ledger(account_id);
CREATE INDEX idx_loyalty_ledger_source ON loyalty_bonus_ledger(source_type, source_id);
CREATE INDEX idx_loyalty_ledger_idempotency ON loyalty_bonus_ledger(idempotency_key);

-- 5. Tiers / Levels
CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id              BIGSERIAL PRIMARY KEY,
    restaurant_id   BIGINT NOT NULL REFERENCES restaurants(id),
    name            VARCHAR(100) NOT NULL,
    level           INT NOT NULL DEFAULT 0,
    threshold       NUMERIC(12,2) NOT NULL DEFAULT 0,
    cashback_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    benefits        JSONB DEFAULT '{}',
    valid_from      TIMESTAMP,
    valid_to        TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loyalty_tiers_restaurant ON loyalty_tiers(restaurant_id);

-- 6. Guest tier history
CREATE TABLE IF NOT EXISTS loyalty_guest_tier_history (
    id              BIGSERIAL PRIMARY KEY,
    guest_id        BIGINT NOT NULL REFERENCES loyalty_guests(id),
    tier_id         BIGINT NOT NULL REFERENCES loyalty_tiers(id),
    assigned_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    reason          VARCHAR(255)
);
CREATE INDEX idx_loyalty_tier_history_guest ON loyalty_guest_tier_history(guest_id);

-- 7. Campaigns (promotions / rules)
CREATE TABLE IF NOT EXISTS loyalty_campaigns (
    id              BIGSERIAL PRIMARY KEY,
    restaurant_id   BIGINT NOT NULL REFERENCES restaurants(id),
    name            VARCHAR(255) NOT NULL,
    campaign_type   VARCHAR(40) NOT NULL, -- MULTIPLIER, WELCOME, BIRTHDAY, WINBACK, REFERRAL, CATEGORY_BONUS, CASHBACK
    rules           JSONB NOT NULL DEFAULT '{}',
    schedule        JSONB DEFAULT '{}',
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, ACTIVE, PAUSED, ARCHIVED
    priority        INT NOT NULL DEFAULT 0,
    valid_from      TIMESTAMP,
    valid_to        TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loyalty_campaigns_restaurant ON loyalty_campaigns(restaurant_id);
CREATE INDEX idx_loyalty_campaigns_status ON loyalty_campaigns(status);

-- 8. Segments
CREATE TABLE IF NOT EXISTS loyalty_segments (
    id              BIGSERIAL PRIMARY KEY,
    restaurant_id   BIGINT NOT NULL REFERENCES restaurants(id),
    name            VARCHAR(255) NOT NULL,
    definition      JSONB NOT NULL DEFAULT '{}',
    guest_count     INT DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loyalty_segments_restaurant ON loyalty_segments(restaurant_id);

-- 9. Campaign-segment linking (which segments a campaign targets)
CREATE TABLE IF NOT EXISTS loyalty_campaign_segments (
    campaign_id     BIGINT NOT NULL REFERENCES loyalty_campaigns(id) ON DELETE CASCADE,
    segment_id      BIGINT NOT NULL REFERENCES loyalty_segments(id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, segment_id)
);

-- 10. Personalized offers
CREATE TABLE IF NOT EXISTS loyalty_personalized_offers (
    id              BIGSERIAL PRIMARY KEY,
    guest_id        BIGINT NOT NULL REFERENCES loyalty_guests(id),
    campaign_id     BIGINT NOT NULL REFERENCES loyalty_campaigns(id),
    reason          VARCHAR(255),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, SENT, REDEEMED, EXPIRED
    valid_from      TIMESTAMP,
    valid_to        TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loyalty_offers_guest ON loyalty_personalized_offers(guest_id);
CREATE INDEX idx_loyalty_offers_status ON loyalty_personalized_offers(status);

-- 11. Missions (gamification)
CREATE TABLE IF NOT EXISTS loyalty_missions (
    id              BIGSERIAL PRIMARY KEY,
    restaurant_id   BIGINT NOT NULL REFERENCES restaurants(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    mission_type    VARCHAR(40) NOT NULL, -- PURCHASE_COUNT, SPEND_AMOUNT, VISIT_STREAK, CATEGORY_TRY, REFERRAL_COUNT
    goal            JSONB NOT NULL DEFAULT '{}',
    reward          JSONB NOT NULL DEFAULT '{}',
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    valid_from      TIMESTAMP,
    valid_to        TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loyalty_missions_restaurant ON loyalty_missions(restaurant_id);

-- 12. Mission progress (per guest)
CREATE TABLE IF NOT EXISTS loyalty_mission_progress (
    id              BIGSERIAL PRIMARY KEY,
    guest_id        BIGINT NOT NULL REFERENCES loyalty_guests(id),
    mission_id      BIGINT NOT NULL REFERENCES loyalty_missions(id),
    current_value   NUMERIC(12,2) NOT NULL DEFAULT 0,
    goal_value      NUMERIC(12,2) NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED, CLAIMED, EXPIRED
    started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMP,
    UNIQUE (guest_id, mission_id)
);
CREATE INDEX idx_loyalty_mission_progress_guest ON loyalty_mission_progress(guest_id);

-- 13. Achievements / Badges
CREATE TABLE IF NOT EXISTS loyalty_achievements (
    id              BIGSERIAL PRIMARY KEY,
    restaurant_id   BIGINT NOT NULL REFERENCES restaurants(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    icon_url        VARCHAR(500),
    criteria        JSONB NOT NULL DEFAULT '{}',
    reward          JSONB DEFAULT '{}',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loyalty_achievements_restaurant ON loyalty_achievements(restaurant_id);

-- 14. Guest achievements (earned badges)
CREATE TABLE IF NOT EXISTS loyalty_guest_achievements (
    id              BIGSERIAL PRIMARY KEY,
    guest_id        BIGINT NOT NULL REFERENCES loyalty_guests(id),
    achievement_id  BIGINT NOT NULL REFERENCES loyalty_achievements(id),
    earned_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (guest_id, achievement_id)
);

-- 15. RFM snapshots
CREATE TABLE IF NOT EXISTS loyalty_rfm_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    guest_id        BIGINT NOT NULL REFERENCES loyalty_guests(id),
    snapshot_date   DATE NOT NULL,
    recency_days    INT NOT NULL DEFAULT 0,
    frequency_count INT NOT NULL DEFAULT 0,
    monetary_sum    NUMERIC(12,2) NOT NULL DEFAULT 0,
    r_score         INT NOT NULL DEFAULT 1, -- 1-5
    f_score         INT NOT NULL DEFAULT 1,
    m_score         INT NOT NULL DEFAULT 1,
    rfm_segment     VARCHAR(40),
    segment_id      BIGINT REFERENCES loyalty_segments(id),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (guest_id, snapshot_date)
);
CREATE INDEX idx_loyalty_rfm_guest ON loyalty_rfm_snapshots(guest_id);
CREATE INDEX idx_loyalty_rfm_date ON loyalty_rfm_snapshots(snapshot_date);
CREATE INDEX idx_loyalty_rfm_segment ON loyalty_rfm_snapshots(rfm_segment);
