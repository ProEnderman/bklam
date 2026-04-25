-- Stage 1 verification: run against DB after Flyway (e.g. psql -f scripts/verify_stage1_schema.sql)
\echo '=== 1) Tables (public schema) ==='
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;

\echo ''
\echo '=== 2) Stage 1 tables exist ==='
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'holdings') AS holdings,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brands') AS brands,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'legal_entities') AS legal_entities,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'locations') AS locations,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouses') AS warehouses;

\echo ''
\echo '=== 3) Counts: restaurants vs locations ==='
SELECT (SELECT count(*) FROM restaurants) AS restaurants, (SELECT count(*) FROM locations) AS locations;

\echo ''
\echo '=== 4) Locations mapping (first 20) ==='
SELECT id, name, legacy_restaurant_id FROM locations ORDER BY id LIMIT 20;

\echo ''
\echo '=== 5) Users: total and without location_id ==='
SELECT count(*) AS total_users,
       count(*) FILTER (WHERE location_id IS NULL) AS users_without_location,
       count(*) FILTER (WHERE restaurant_id IS NOT NULL AND location_id IS NULL) AS with_restaurant_but_no_location
FROM users;

\echo ''
\echo '=== 6) Orders: has location_id column and sample ==='
SELECT count(*) AS total_orders,
       count(*) FILTER (WHERE location_id IS NOT NULL) AS orders_with_location
FROM orders;
