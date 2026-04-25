-- Runs in docker-entrypoint context for the created database (restaurant_db).
-- Non-superuser role: PostgreSQL superusers bypass RLS.
CREATE USER rls_it WITH PASSWORD 'postgres' LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT ALL PRIVILEGES ON DATABASE restaurant_db TO rls_it;
GRANT ALL ON SCHEMA public TO rls_it;
GRANT CREATE ON SCHEMA public TO rls_it;
