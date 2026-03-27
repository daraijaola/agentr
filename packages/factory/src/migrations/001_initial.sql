-- AGENTR Platform Database Schema
-- PostgreSQL  multi-tenant, platform-wide

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE,
  telegram_user_id BIGINT,
  username VARCHAR(255),
  first_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenants — one per provisioned agent
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL UNIQUE,
  wallet_address VARCHAR(100),
  wallet_mnemonic_enc TEXT,
  plan VARCHAR(20) DEFAULT 'starter' CHECK (plan IN ('starter','pro','elite','enterprise')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','cancelled')),
  container_id VARCHAR(100),
  agent_name VARCHAR(255) DEFAULT '',
  owner_name VARCHAR(255) DEFAULT '',
  owner_username VARCHAR(255) DEFAULT '',
  dm_policy VARCHAR(20) DEFAULT 'contacts' CHECK (dm_policy IN ('everyone','contacts','manual')),
  llm_provider VARCHAR(30) DEFAULT 'moonshot',
  telegram_user_id BIGINT,
  credits INTEGER DEFAULT 500,
  trial_expires_at TIMESTAMPTZ,
  is_trial_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent instances — runtime state per tenant
CREATE TABLE IF NOT EXISTS agent_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'stopped' CHECK (status IN ('provisioning','running','stopped','error')),
  last_active_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing events — TON payment records
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  amount_ton NUMERIC(18,9),
  tx_hash VARCHAR(100) UNIQUE,
  plan VARCHAR(20),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit transactions — per-LLM-call usage + top-ups
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(100) NOT NULL,
  amount INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('usage','topup','withdrawal','bonus')),
  description TEXT DEFAULT '',
  model VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent messages — activity log per tenant
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_message TEXT,
  reply TEXT,
  tool_calls TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Developer accounts — marketplace dev portal
CREATE TABLE IF NOT EXISTS dev_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  telegram_username VARCHAR(255),
  wallet_address VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100),
  bio TEXT DEFAULT '',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved BOOLEAN DEFAULT FALSE,
  earnings_credits INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Marketplace agents — published agent configs
CREATE TABLE IF NOT EXISTS marketplace_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  creator_id UUID REFERENCES dev_accounts(id) ON DELETE SET NULL,
  creator_name VARCHAR(255),
  github_url TEXT,
  test_account VARCHAR(255),
  notes TEXT DEFAULT '',
  soul TEXT,
  identity TEXT,
  strategy TEXT,
  price_credits INTEGER DEFAULT 0,
  installs INTEGER DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT FALSE,
  reviewer_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate limits — persistent per-IP request counters (survives API restarts)
CREATE TABLE IF NOT EXISTS rate_limits (
  ip        VARCHAR(64) PRIMARY KEY,
  count     INTEGER NOT NULL DEFAULT 1,
  reset_at  BIGINT  NOT NULL  -- Unix ms when the current window expires
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone);
CREATE INDEX IF NOT EXISTS idx_agent_instances_tenant_id ON agent_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_tenant_id ON billing_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_tx_hash ON billing_events(tx_hash);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_tenant_id ON credit_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_tenant_id ON agent_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_agents_active ON marketplace_agents(active);
CREATE INDEX IF NOT EXISTS idx_dev_accounts_token ON dev_accounts(token);
