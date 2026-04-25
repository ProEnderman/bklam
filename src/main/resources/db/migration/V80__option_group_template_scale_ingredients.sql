-- Несколько ингредиентов рецепта, чей расход масштабируется по выбранному числу (valueInt / stock_scale_base).
DO $$
BEGIN
    IF to_regclass('public.option_group_templates') IS NOT NULL THEN
        CREATE TABLE IF NOT EXISTS option_group_template_scale_ingredients (
            id BIGSERIAL PRIMARY KEY,
            option_group_template_id BIGINT NOT NULL REFERENCES option_group_templates (id) ON DELETE CASCADE,
            ingredient_id BIGINT NOT NULL REFERENCES ingredients (id),
            UNIQUE (option_group_template_id, ingredient_id)
        );

        CREATE INDEX IF NOT EXISTS idx_opt_grp_tmpl_scale_ing ON option_group_template_scale_ingredients (option_group_template_id);
        COMMENT ON TABLE option_group_template_scale_ingredients IS 'Ингредиенты рецепта, чей расход умножается на (выбор гостя / stock_scale_base)';
    ELSE
        RAISE NOTICE 'Skipping V80: option_group_templates table does not exist';
    END IF;
END $$;
