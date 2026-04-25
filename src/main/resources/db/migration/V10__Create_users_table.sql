CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('HEAD_ADMIN', 'ADMIN', 'REGULAR_WORKER')),
    restaurant_id BIGINT REFERENCES restaurants(id) ON DELETE SET NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT head_admin_no_restaurant CHECK (
        (role = 'HEAD_ADMIN' AND restaurant_id IS NULL) OR
        (role != 'HEAD_ADMIN' AND restaurant_id IS NOT NULL)
    )
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_restaurant_id ON users(restaurant_id);
CREATE INDEX idx_users_role ON users(role);

