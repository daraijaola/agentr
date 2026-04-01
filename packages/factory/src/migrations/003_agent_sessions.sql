-- Fix plan constraint to include 'free' and 'ultra'
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check
  CHECK (plan IN ('free','starter','pro','ultra','elite','enterprise'));

-- Agent sessions: encrypted session strings with health tracking
CREATE TABLE IF NOT EXISTS agent_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone         VARCHAR(20) NOT NULL,
  session_string TEXT NOT NULL DEFAULT '',
  health_score  INTEGER DEFAULT 100,
  last_ping     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_tenant ON agent_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_health   ON agent_sessions(health_score);
