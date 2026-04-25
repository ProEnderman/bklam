-- Allow deleting a restaurant: cascade delete all dependent rows.
-- 1) Bookings must be deleted when activities/resources are deleted (so CASCADE order works).
-- 2) All FKs pointing to restaurants(id) get ON DELETE CASCADE.

-- Bookings: when activity or resource is deleted, delete the booking (so restaurant CASCADE can delete activities/resources after bookings)
ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS bookings_activity_id_fkey,
    DROP CONSTRAINT IF EXISTS bookings_resource_id_fkey;
ALTER TABLE bookings
    ADD CONSTRAINT bookings_activity_id_fkey
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;
ALTER TABLE bookings
    ADD CONSTRAINT bookings_resource_id_fkey
        FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE;

-- Calendars (branch_id -> restaurants)
ALTER TABLE calendars DROP CONSTRAINT IF EXISTS calendars_branch_id_fkey;
ALTER TABLE calendars ADD CONSTRAINT calendars_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES restaurants(id) ON DELETE CASCADE;

-- Activities (branch_id -> restaurants)
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_branch_id_fkey;
ALTER TABLE activities ADD CONSTRAINT activities_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES restaurants(id) ON DELETE CASCADE;

-- Resources (branch_id -> restaurants)
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_branch_id_fkey;
ALTER TABLE resources ADD CONSTRAINT resources_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES restaurants(id) ON DELETE CASCADE;

-- Bookings (branch_id -> restaurants)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_branch_id_fkey;
ALTER TABLE bookings ADD CONSTRAINT bookings_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES restaurants(id) ON DELETE CASCADE;

-- Tariff
ALTER TABLE tariff_plans DROP CONSTRAINT IF EXISTS tariff_plans_restaurant_id_fkey;
ALTER TABLE tariff_plans ADD CONSTRAINT tariff_plans_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE tariff_calendars DROP CONSTRAINT IF EXISTS tariff_calendars_restaurant_id_fkey;
ALTER TABLE tariff_calendars ADD CONSTRAINT tariff_calendars_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE pricing_runs DROP CONSTRAINT IF EXISTS pricing_runs_restaurant_id_fkey;
ALTER TABLE pricing_runs ADD CONSTRAINT pricing_runs_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

-- Shifts
ALTER TABLE shift_templates DROP CONSTRAINT IF EXISTS shift_templates_restaurant_id_fkey;
ALTER TABLE shift_templates ADD CONSTRAINT shift_templates_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_restaurant_id_fkey;
ALTER TABLE shifts ADD CONSTRAINT shifts_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

-- Analytics
ALTER TABLE daily_branch_revenue DROP CONSTRAINT IF EXISTS daily_branch_revenue_restaurant_id_fkey;
ALTER TABLE daily_branch_revenue ADD CONSTRAINT daily_branch_revenue_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE service_performance DROP CONSTRAINT IF EXISTS service_performance_restaurant_id_fkey;
ALTER TABLE service_performance ADD CONSTRAINT service_performance_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE employee_utilization DROP CONSTRAINT IF EXISTS employee_utilization_restaurant_id_fkey;
ALTER TABLE employee_utilization ADD CONSTRAINT employee_utilization_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE pricing_rule_impact DROP CONSTRAINT IF EXISTS pricing_rule_impact_restaurant_id_fkey;
ALTER TABLE pricing_rule_impact ADD CONSTRAINT pricing_rule_impact_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE stop_check_analytics DROP CONSTRAINT IF EXISTS stop_check_analytics_restaurant_id_fkey;
ALTER TABLE stop_check_analytics ADD CONSTRAINT stop_check_analytics_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

-- Loyalty
ALTER TABLE loyalty_guests DROP CONSTRAINT IF EXISTS loyalty_guests_restaurant_id_fkey;
ALTER TABLE loyalty_guests ADD CONSTRAINT loyalty_guests_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE loyalty_tiers DROP CONSTRAINT IF EXISTS loyalty_tiers_restaurant_id_fkey;
ALTER TABLE loyalty_tiers ADD CONSTRAINT loyalty_tiers_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE loyalty_campaigns DROP CONSTRAINT IF EXISTS loyalty_campaigns_restaurant_id_fkey;
ALTER TABLE loyalty_campaigns ADD CONSTRAINT loyalty_campaigns_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE loyalty_segments DROP CONSTRAINT IF EXISTS loyalty_segments_restaurant_id_fkey;
ALTER TABLE loyalty_segments ADD CONSTRAINT loyalty_segments_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE loyalty_missions DROP CONSTRAINT IF EXISTS loyalty_missions_restaurant_id_fkey;
ALTER TABLE loyalty_missions ADD CONSTRAINT loyalty_missions_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE loyalty_achievements DROP CONSTRAINT IF EXISTS loyalty_achievements_restaurant_id_fkey;
ALTER TABLE loyalty_achievements ADD CONSTRAINT loyalty_achievements_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

-- Other
ALTER TABLE booking_notifications DROP CONSTRAINT IF EXISTS booking_notifications_restaurant_id_fkey;
ALTER TABLE booking_notifications ADD CONSTRAINT booking_notifications_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE guest_sessions DROP CONSTRAINT IF EXISTS guest_sessions_restaurant_id_fkey;
ALTER TABLE guest_sessions ADD CONSTRAINT guest_sessions_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE telegram_sessions DROP CONSTRAINT IF EXISTS telegram_sessions_restaurant_id_fkey;
ALTER TABLE telegram_sessions ADD CONSTRAINT telegram_sessions_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

ALTER TABLE loyalty_order_accruals DROP CONSTRAINT IF EXISTS loyalty_order_accruals_restaurant_id_fkey;
ALTER TABLE loyalty_order_accruals ADD CONSTRAINT loyalty_order_accruals_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;

-- Loyalty: when loyalty_guests are deleted (via restaurant CASCADE), delete their dependent rows
ALTER TABLE loyalty_guest_aliases DROP CONSTRAINT IF EXISTS loyalty_guest_aliases_primary_guest_id_fkey;
ALTER TABLE loyalty_guest_aliases ADD CONSTRAINT loyalty_guest_aliases_primary_guest_id_fkey
    FOREIGN KEY (primary_guest_id) REFERENCES loyalty_guests(id) ON DELETE CASCADE;

ALTER TABLE loyalty_bonus_accounts DROP CONSTRAINT IF EXISTS loyalty_bonus_accounts_guest_id_fkey;
ALTER TABLE loyalty_bonus_accounts ADD CONSTRAINT loyalty_bonus_accounts_guest_id_fkey
    FOREIGN KEY (guest_id) REFERENCES loyalty_guests(id) ON DELETE CASCADE;

ALTER TABLE loyalty_bonus_ledger DROP CONSTRAINT IF EXISTS loyalty_bonus_ledger_account_id_fkey;
ALTER TABLE loyalty_bonus_ledger ADD CONSTRAINT loyalty_bonus_ledger_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES loyalty_bonus_accounts(id) ON DELETE CASCADE;

ALTER TABLE loyalty_guest_tier_history DROP CONSTRAINT IF EXISTS loyalty_guest_tier_history_guest_id_fkey;
ALTER TABLE loyalty_guest_tier_history ADD CONSTRAINT loyalty_guest_tier_history_guest_id_fkey
    FOREIGN KEY (guest_id) REFERENCES loyalty_guests(id) ON DELETE CASCADE;

ALTER TABLE loyalty_guest_tier_history DROP CONSTRAINT IF EXISTS loyalty_guest_tier_history_tier_id_fkey;
ALTER TABLE loyalty_guest_tier_history ADD CONSTRAINT loyalty_guest_tier_history_tier_id_fkey
    FOREIGN KEY (tier_id) REFERENCES loyalty_tiers(id) ON DELETE CASCADE;

ALTER TABLE loyalty_personalized_offers DROP CONSTRAINT IF EXISTS loyalty_personalized_offers_guest_id_fkey;
ALTER TABLE loyalty_personalized_offers ADD CONSTRAINT loyalty_personalized_offers_guest_id_fkey
    FOREIGN KEY (guest_id) REFERENCES loyalty_guests(id) ON DELETE CASCADE;

ALTER TABLE loyalty_mission_progress DROP CONSTRAINT IF EXISTS loyalty_mission_progress_guest_id_fkey;
ALTER TABLE loyalty_mission_progress ADD CONSTRAINT loyalty_mission_progress_guest_id_fkey
    FOREIGN KEY (guest_id) REFERENCES loyalty_guests(id) ON DELETE CASCADE;

ALTER TABLE loyalty_guest_achievements DROP CONSTRAINT IF EXISTS loyalty_guest_achievements_guest_id_fkey;
ALTER TABLE loyalty_guest_achievements ADD CONSTRAINT loyalty_guest_achievements_guest_id_fkey
    FOREIGN KEY (guest_id) REFERENCES loyalty_guests(id) ON DELETE CASCADE;

ALTER TABLE loyalty_rfm_snapshots DROP CONSTRAINT IF EXISTS loyalty_rfm_snapshots_guest_id_fkey;
ALTER TABLE loyalty_rfm_snapshots ADD CONSTRAINT loyalty_rfm_snapshots_guest_id_fkey
    FOREIGN KEY (guest_id) REFERENCES loyalty_guests(id) ON DELETE CASCADE;

-- When loyalty_campaigns / loyalty_missions / loyalty_achievements are deleted (via restaurant CASCADE)
ALTER TABLE loyalty_personalized_offers DROP CONSTRAINT IF EXISTS loyalty_personalized_offers_campaign_id_fkey;
ALTER TABLE loyalty_personalized_offers ADD CONSTRAINT loyalty_personalized_offers_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(id) ON DELETE CASCADE;

ALTER TABLE loyalty_mission_progress DROP CONSTRAINT IF EXISTS loyalty_mission_progress_mission_id_fkey;
ALTER TABLE loyalty_mission_progress ADD CONSTRAINT loyalty_mission_progress_mission_id_fkey
    FOREIGN KEY (mission_id) REFERENCES loyalty_missions(id) ON DELETE CASCADE;

ALTER TABLE loyalty_guest_achievements DROP CONSTRAINT IF EXISTS loyalty_guest_achievements_achievement_id_fkey;
ALTER TABLE loyalty_guest_achievements ADD CONSTRAINT loyalty_guest_achievements_achievement_id_fkey
    FOREIGN KEY (achievement_id) REFERENCES loyalty_achievements(id) ON DELETE CASCADE;
