CREATE TABLE dish_ingredients (
    id BIGSERIAL PRIMARY KEY,
    dish_id BIGINT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    qty_per_dish DOUBLE PRECISION NOT NULL CHECK (qty_per_dish > 0),
    UNIQUE(dish_id, ingredient_id)
);

CREATE INDEX idx_dish_ingredients_dish_id ON dish_ingredients(dish_id);
CREATE INDEX idx_dish_ingredients_ingredient_id ON dish_ingredients(ingredient_id);

