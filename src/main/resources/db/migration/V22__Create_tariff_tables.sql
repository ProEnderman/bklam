-- Тарифные планы
CREATE TABLE tariff_plans (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT true,
    valid_from DATE,
    valid_to DATE,
    application_level VARCHAR(50) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    restaurant_id BIGINT REFERENCES restaurants(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_tariff_plans_restaurant ON tariff_plans(restaurant_id);
CREATE INDEX idx_tariff_plans_active ON tariff_plans(is_active);
CREATE INDEX idx_tariff_plans_priority ON tariff_plans(priority DESC);

-- Правила тарифов
CREATE TABLE tariff_rules (
    id BIGSERIAL PRIMARY KEY,
    tariff_plan_id BIGINT NOT NULL REFERENCES tariff_plans(id) ON DELETE CASCADE,
    rule_type VARCHAR(50) NOT NULL,
    rule_order INTEGER NOT NULL DEFAULT 0,
    conditions TEXT, -- JSON
    pricing_formula TEXT, -- JSON
    rounding_type VARCHAR(50),
    rounding_precision NUMERIC(10,2) DEFAULT 0.01,
    min_amount NUMERIC(10,2),
    max_amount NUMERIC(10,2),
    min_duration_minutes INTEGER,
    max_duration_minutes INTEGER,
    free_minutes INTEGER,
    free_units INTEGER,
    is_stop_check BOOLEAN NOT NULL DEFAULT false,
    stop_reason TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_tariff_rules_plan ON tariff_rules(tariff_plan_id);
CREATE INDEX idx_tariff_rules_type ON tariff_rules(rule_type);
CREATE INDEX idx_tariff_rules_order ON tariff_rules(rule_order);

-- Календарь тарифов
CREATE TABLE tariff_calendars (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    restaurant_id BIGINT REFERENCES restaurants(id),
    weekend_days TEXT, -- JSON массив
    fixed_holidays TEXT, -- JSON массив дат
    floating_holidays TEXT, -- JSON с правилами
    short_days TEXT, -- JSON
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_tariff_calendars_restaurant ON tariff_calendars(restaurant_id);

-- Запуски расчётов
CREATE TABLE pricing_runs (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES orders(id),
    restaurant_id BIGINT REFERENCES restaurants(id),
    input_params TEXT, -- JSON
    service_start TIMESTAMP,
    service_end TIMESTAMP,
    applied_rules TEXT, -- JSON массив ID правил
    tariff_versions TEXT, -- JSON с версиями
    status VARCHAR(50) NOT NULL DEFAULT 'OK',
    stop_reason TEXT,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    base_amount NUMERIC(10,2),
    discount_amount NUMERIC(10,2) DEFAULT 0,
    tax_amount NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricing_runs_order ON pricing_runs(order_id);
CREATE INDEX idx_pricing_runs_restaurant ON pricing_runs(restaurant_id);
CREATE INDEX idx_pricing_runs_status ON pricing_runs(status);
CREATE INDEX idx_pricing_runs_created ON pricing_runs(created_at);

-- Детализация расчётов
CREATE TABLE pricing_breakdowns (
    id BIGSERIAL PRIMARY KEY,
    pricing_run_id BIGINT NOT NULL REFERENCES pricing_runs(id) ON DELETE CASCADE,
    tariff_rule_id BIGINT REFERENCES tariff_rules(id),
    line_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    rule_reason TEXT,
    amount NUMERIC(10,2) NOT NULL,
    quantity NUMERIC(10,2),
    rate NUMERIC(10,2),
    coefficient NUMERIC(10,2),
    line_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricing_breakdowns_run ON pricing_breakdowns(pricing_run_id);
CREATE INDEX idx_pricing_breakdowns_rule ON pricing_breakdowns(tariff_rule_id);
CREATE INDEX idx_pricing_breakdowns_order ON pricing_breakdowns(line_order);




