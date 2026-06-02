-- Per-restaurant bank bot (shared by all staff of the restaurant)
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "bank_bot_username" TEXT;
