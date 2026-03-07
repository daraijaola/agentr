-- AGENTR Platform Database Schema
-- PostgreSQL  multi-tenant, platform-wide

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE,
  username VARCHAR(255),
  first_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenants  one per provisioned agent
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL UNIQUE,
  wallet_address VARCHAR(100),
  wallet_mnemonic_enc TEXT, -- encrypted mnemonic
  plan VARCHAR(20) DEFAULT 'starter' CHECK (plan IN ('starter','builder','pro','enterprise')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','cancelled')),
  container_id VARCHAR(100), -- Docker container ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent instances  runtime state per tenant
CREATE TABLE IF NOT EXISTS agent_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'stopped' CHECK (status IN ('provisioning','running','stopped','error')),
  last_active_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing events  TON payment records
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'subscription_paid', 'subscription_expired', etc.
  amount_ton NUMERIC(18,9),
  tx_hash VARCHAR(100) UNIQUE,
  plan VARCHAR(20),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_agent_instances_tenant_id ON agent_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_tenant_id ON billing_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_tx_hash ON billing_events(tx_hash);
