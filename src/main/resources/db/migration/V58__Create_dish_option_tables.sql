-- ==========================================
-- Modifier Template System (3-layer model):
--   Template → Instance (per-dish) → Order Snapshot
-- ==========================================

-- 1) Reusable modifier group templates
CREATE TABLE option_group_templates (
    id                      BIGSERIAL PRIMARY KEY,
    key                     VARCHAR(64) NOT NULL UNIQUE,
    title                   VARCHAR(200) NOT NULL,
    type                    VARCHAR(40)  NOT NULL,
    presentation            VARCHAR(20)  NOT NULL DEFAULT 'CHECKBOX',
    min_select              INT,
    max_select              INT,
    min_total_qty           INT,
    max_total_qty           INT,
    range_min               INT,
    range_max               INT,
    pricing_mode            VARCHAR(20),
    price_per_unit          NUMERIC(12,2),
    allow_same_option_twice BOOLEAN,
    sort_order              INT NOT NULL DEFAULT 0,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2) Option items within a template
CREATE TABLE option_item_templates (
    id                  BIGSERIAL PRIMARY KEY,
    template_id         BIGINT NOT NULL REFERENCES option_group_templates(id) ON DELETE CASCADE,
    title               VARCHAR(200) NOT NULL,
    price_delta         NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order          INT NOT NULL DEFAULT 0,
    per_option_max_qty  INT,
    value_int           INT,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_option_item_templates_template_id ON option_item_templates(template_id);

-- 3) Per-dish instance of a template (with optional overrides)
CREATE TABLE dish_option_groups (
    id                          BIGSERIAL PRIMARY KEY,
    dish_id                     BIGINT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
    template_id                 BIGINT NOT NULL REFERENCES option_group_templates(id) ON DELETE CASCADE,
    override_min_select         INT,
    override_max_select         INT,
    override_min_total_qty      INT,
    override_max_total_qty      INT,
    override_range_min          INT,
    override_range_max          INT,
    override_price_per_unit     NUMERIC(12,2),
    sort_order                  INT NOT NULL DEFAULT 0,
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_dish_option_groups_dish_id ON dish_option_groups(dish_id);

-- 4) Order-time snapshot of selected modifiers
-- For RANGE_STEPPER: one row per group, option_title_snapshot = "Ложки: 4",
--   value_int_snapshot = chosen value, price_delta_snapshot = calculated delta.
CREATE TABLE order_item_options (
    id                       BIGSERIAL PRIMARY KEY,
    order_item_id            BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    template_id              BIGINT,
    option_item_template_id  BIGINT,
    group_title_snapshot     VARCHAR(200) NOT NULL,
    option_title_snapshot    VARCHAR(200) NOT NULL,
    price_delta_snapshot     NUMERIC(12,2) NOT NULL DEFAULT 0,
    option_qty               INT NOT NULL DEFAULT 1,
    value_int_snapshot       INT,
    created_at               TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_order_item_options_order_item_id ON order_item_options(order_item_id);
