DO $$
BEGIN
    IF to_regclass('public.option_item_templates') IS NOT NULL THEN
        CREATE TABLE IF NOT EXISTS option_item_template_ingredients (
            id BIGSERIAL PRIMARY KEY,
            option_item_template_id BIGINT NOT NULL REFERENCES option_item_templates (id) ON DELETE CASCADE,
            ingredient_id BIGINT NOT NULL REFERENCES ingredients (id),
            qty_per_unit DOUBLE PRECISION NOT NULL,
            UNIQUE (option_item_template_id, ingredient_id)
        );

        CREATE INDEX IF NOT EXISTS idx_option_item_tmpl_ing_option ON option_item_template_ingredients (option_item_template_id);
        COMMENT ON TABLE option_item_template_ingredients IS 'Доп. списание нескольких ингредиентов на 1 ед. опции (помимо одного stock_ingredient_id на шаблоне опции)';
    ELSE
        RAISE NOTICE 'Skipping V79: option_item_templates table does not exist';
    END IF;
END $$;
