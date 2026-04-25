DO $$
BEGIN
    IF to_regclass('public.option_group_templates') IS NOT NULL THEN
        ALTER TABLE option_group_templates
            ADD COLUMN IF NOT EXISTS stock_ingredient_id BIGINT REFERENCES ingredients (id);
        ALTER TABLE option_group_templates
            ADD COLUMN IF NOT EXISTS stock_scale_base INTEGER NOT NULL DEFAULT 1;

        COMMENT ON COLUMN option_group_templates.stock_ingredient_id IS 'Ингредиент: норма в рецепте × (выбор / stock_scale_base)';
        COMMENT ON COLUMN option_group_templates.stock_scale_base IS 'Базовое число единиц в рецепте для этого ингредиента (обычно 1)';
    ELSE
        RAISE NOTICE 'Skipping V78 option_group_templates changes: table does not exist';
    END IF;

    IF to_regclass('public.option_item_templates') IS NOT NULL THEN
        ALTER TABLE option_item_templates
            ADD COLUMN IF NOT EXISTS stock_ingredient_id BIGINT REFERENCES ingredients (id);
        ALTER TABLE option_item_templates
            ADD COLUMN IF NOT EXISTS stock_qty_per_unit DOUBLE PRECISION;

        COMMENT ON COLUMN option_item_templates.stock_qty_per_unit IS 'Доп. списание на 1 optionQty';
    ELSE
        RAISE NOTICE 'Skipping V78 option_item_templates changes: table does not exist';
    END IF;
END $$;
