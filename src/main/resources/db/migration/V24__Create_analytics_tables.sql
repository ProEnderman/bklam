-- Витрина данных: выручка по дням/филиалам
CREATE TABLE daily_branch_revenue (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT REFERENCES restaurants(id),
    date DATE NOT NULL,
    total_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    order_count INTEGER NOT NULL DEFAULT 0,
    average_check NUMERIC(10,2),
    discount_amount NUMERIC(10,2) DEFAULT 0,
    tax_amount NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(restaurant_id, date)
);

CREATE INDEX idx_daily_revenue_restaurant ON daily_branch_revenue(restaurant_id);
CREATE INDEX idx_daily_revenue_date ON daily_branch_revenue(date);

-- Витрина данных: производительность услуг
CREATE TABLE service_performance (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT REFERENCES restaurants(id),
    dish_id BIGINT REFERENCES dishes(id),
    date DATE NOT NULL,
    order_count INTEGER NOT NULL DEFAULT 0,
    total_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    average_price NUMERIC(10,2),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(restaurant_id, dish_id, date)
);

CREATE INDEX idx_service_perf_restaurant ON service_performance(restaurant_id);
CREATE INDEX idx_service_perf_dish ON service_performance(dish_id);
CREATE INDEX idx_service_perf_date ON service_performance(date);

-- Витрина данных: загрузка сотрудников
CREATE TABLE employee_utilization (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES users(id),
    restaurant_id BIGINT REFERENCES restaurants(id),
    date DATE NOT NULL,
    shift_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
    worked_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
    revenue_per_hour NUMERIC(10,2),
    order_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(employee_id, restaurant_id, date)
);

CREATE INDEX idx_emp_util_employee ON employee_utilization(employee_id);
CREATE INDEX idx_emp_util_restaurant ON employee_utilization(restaurant_id);
CREATE INDEX idx_emp_util_date ON employee_utilization(date);

-- Витрина данных: влияние правил тарификации
CREATE TABLE pricing_rule_impact (
    id BIGSERIAL PRIMARY KEY,
    tariff_rule_id BIGINT REFERENCES tariff_rules(id),
    restaurant_id BIGINT REFERENCES restaurants(id),
    date DATE NOT NULL,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    total_impact NUMERIC(10,2) NOT NULL DEFAULT 0,
    average_impact NUMERIC(10,2),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(tariff_rule_id, restaurant_id, date)
);

CREATE INDEX idx_pricing_impact_rule ON pricing_rule_impact(tariff_rule_id);
CREATE INDEX idx_pricing_impact_restaurant ON pricing_rule_impact(restaurant_id);
CREATE INDEX idx_pricing_impact_date ON pricing_rule_impact(date);

-- Витрина данных: аналитика стоп-чеков
CREATE TABLE stop_check_analytics (
    id BIGSERIAL PRIMARY KEY,
    tariff_rule_id BIGINT REFERENCES tariff_rules(id),
    restaurant_id BIGINT REFERENCES restaurants(id),
    date DATE NOT NULL,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    stop_reason TEXT,
    estimated_loss NUMERIC(10,2),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_stop_check_rule ON stop_check_analytics(tariff_rule_id);
CREATE INDEX idx_stop_check_restaurant ON stop_check_analytics(restaurant_id);
CREATE INDEX idx_stop_check_date ON stop_check_analytics(date);




