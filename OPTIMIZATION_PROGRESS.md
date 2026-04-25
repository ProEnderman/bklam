# Прогресс оптимизации карты зала

## ✅ Выполнено (Backend)

1. **Версионирование карты**
   - Миграция `V37__Add_version_to_hall_maps.sql` - добавлен `version` в `hall_maps`
   - Обновлена модель `HallMap.java` - добавлено поле `version` с автоинкрементом в `@PreUpdate`
   - Обновлён DTO `HallMapDto` - добавлено поле `version`

2. **PATCH endpoint для дифференциальных обновлений**
   - Создан `HallItemsPatchRequest` DTO (added/updated/removedIds/baseVersion)
   - Создан `HallItemsPatchResponse` DTO (newVersion/upserted/removedIds)
   - Реализован метод `patchItems()` в `HallService`:
     - Проверка версии (оптимистичная блокировка)
     - Batch delete для removedIds
     - Batch insert для added
     - Batch update для updated
     - Автоинкремент версии карты
   - Добавлен endpoint `PATCH /api/hall/items` в `HallController`
   - Добавлены методы в `HallPlacedItemRepository`:
     - `deleteByIds(List<Long> ids)` - bulk delete
     - `findByIds(List<Long> ids)` - bulk select

## ✅ Выполнено (Frontend - частично)

1. **Типы для PATCH**
   - Добавлен `version` в `HallMap` interface
   - Создан `HallItemsPatchRequest` interface
   - Создан `HallItemsPatchResponse` interface
   - Добавлен метод `patchItems()` в `hallService`

2. **Разделение persisted vs editing state**
   - Добавлен `persistedItems` (из `view.items`)
   - Добавлен `items` (merged: persisted + dirtyAdds + dirtyUpdates - dirtyRemoves)
   - Добавлены dirty state:
     - `dirtyAdds: Map<clientId, Item>` - новые items
     - `dirtyUpdates: Map<id, Partial<Item>>` - изменения существующих
     - `dirtyRemoves: Set<id>` - удалённые items

3. **Функция отправки патча с debounce**
   - `flushPatch(immediate)` - отправляет патч с debounce 500ms
   - Автоматический flush на mouseup (через `immediate=true`)
   - Обработка version conflict (409/412) - перезагрузка
   - Обновление persisted state после успешного патча

4. **Helper функции (частично)**
   - `addItem(item)` - добавляет в dirtyAdds
   - `updateItem(id, update)` - добавляет в dirtyUpdates
   - `removeItem(id)` - добавляет в dirtyRemoves или удаляет из dirtyAdds

## ✅ Завершено (Frontend - полностью)

1. **Обновление всех мест использования `replaceItems()`**
   - ✅ Все 9 вызовов `hallService.replaceItems()` заменены на helper функции
   - ✅ `handleGridClick` - использует `addItem()` + `flushPatch(true)`
   - ✅ `handleCreateTableAndPlace` - использует `addItem()` + `flushPatch(true)`
   - ✅ `handleGridMouseUp` - использует `addItem()` для рисования, `updateItem()` для перемещения, `removeItem()` для ластика + `flushPatch(true)` на mouseup
   - ✅ `onKeyDown` (поворот) - использует `updateItem()` + `flushPatch(true)`
   - ✅ `eraseAtCell` - использует `removeItem()`
   - ✅ `handleItemContextMenu` - использует `removeItem()` + `flushPatch(true)`
   - ✅ Очистка карты - использует `removeItem()` для всех items + `flushPatch(true)`
   - ✅ `handleUndo` - использует `removeItem()`/`addItem()`/`updateItem()` + `flushPatch(true)`

## ✅ Дополнительные оптимизации (выполнено)

1. **Batch операции на backend**
   - ✅ Использование `saveAll()` вместо цикла `save()` для insert и update
   - ✅ Предзагрузка assets и tables одним запросом (`findAllById`)
   - ✅ Настройка Hibernate batch_size=50 в `application.yml`
   - ✅ Включены `order_inserts` и `order_updates` для группировки SQL
   - Снижение количества запросов к БД с N до 2-3

## ❌ Не выполнено (опционально)

1. **Spatial index для коллизий**
   - Нужно реализовать grid-based spatial hash
   - Заменить O(n) проверки в `isCellTooCloseToAnyTable` и `rectTooCloseToAnyTable`

2. **Viewport-based rendering**
   - Фильтрация items по видимой области (с учётом zoom/pan)

3. **Оптимизация pan/zoom**
   - Использование refs вместо state для pan/zoom
   - requestAnimationFrame для обновления transform

## Следующие шаги

1. **Завершить миграцию на PATCH** (приоритет 1)
   - Обновить все места использования `replaceItems()` на helper функции
   - Протестировать добавление/обновление/удаление items

2. **Добавить flush на mouseup** (приоритет 1)
   - В `handleGridMouseUp` вызывать `flushPatch(true)` для немедленной отправки

3. **Spatial index** (приоритет 2)
   - Реализовать простейший grid-based index
   - Обновить функции коллизий

4. **Тестирование** (приоритет 1)
   - Проверить работу с большим количеством items (1000+)
   - Проверить производительность при быстром рисовании
   - Проверить обработку version conflicts

