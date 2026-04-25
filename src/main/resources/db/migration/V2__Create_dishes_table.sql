CREATE TABLE dishes (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_dishes_name ON dishes(name);
CREATE INDEX idx_dishes_is_active ON dishes(is_active);

