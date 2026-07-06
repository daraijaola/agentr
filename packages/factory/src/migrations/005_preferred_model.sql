-- Migration 005: per-tenant preferred model
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS preferred_model VARCHAR(100);
