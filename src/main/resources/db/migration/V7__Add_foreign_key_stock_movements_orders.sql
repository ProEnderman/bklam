-- Добавляем внешний ключ на orders после создания таблицы orders
ALTER TABLE stock_movements 
ADD CONSTRAINT fk_stock_movements_order_id 
FOREIGN KEY (order_id) REFERENCES orders(id);

