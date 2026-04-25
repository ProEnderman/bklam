DO $$
BEGIN
    IF to_regclass('public.option_group_template_scale_ingredients') IS NOT NULL THEN
        ALTER TABLE option_group_template_scale_ingredients
            ADD COLUMN IF NOT EXISTS anchor_value DOUBLE PRECISION NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS target_qty DOUBLE PRECISION NOT NULL DEFAULT 0;
    ELSE
        RAISE NOTICE 'Skipping V81: option_group_template_scale_ingredients table does not exist';
    END IF;
END $$;

