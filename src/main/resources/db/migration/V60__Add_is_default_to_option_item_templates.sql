ALTER TABLE option_item_templates
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_option_item_templates_template_default
    ON option_item_templates(template_id, is_default);
