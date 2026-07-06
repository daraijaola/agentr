-- Migration 006: BTL Runtime plan defaults
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_plan_check
  CHECK (plan IN ('free','starter','pro','ultra','elite','enterprise'));

ALTER TABLE tenants ALTER COLUMN plan SET DEFAULT 'free';
ALTER TABLE tenants ALTER COLUMN credits SET DEFAULT 1000;
ALTER TABLE tenants ALTER COLUMN llm_provider SET DEFAULT 'air';
