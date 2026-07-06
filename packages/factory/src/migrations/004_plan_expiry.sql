-- Migration 004: plan expiry + grace period
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grace_until     TIMESTAMPTZ;
