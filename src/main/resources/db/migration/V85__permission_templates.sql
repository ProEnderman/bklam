-- Шаблоны разрешений для быстрого назначения прав работникам (REGULAR_WORKER)
CREATE TABLE IF NOT EXISTS permission_templates (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_permission_templates_restaurant_name UNIQUE (restaurant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_permission_templates_restaurant_id ON permission_templates(restaurant_id);

COMMENT ON TABLE permission_templates IS 'Именованные наборы прав для создания сотрудников в рамках ресторана';

ALTER TABLE permission_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_permission_templates ON permission_templates;
CREATE POLICY tenant_isolation_permission_templates ON permission_templates
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);
