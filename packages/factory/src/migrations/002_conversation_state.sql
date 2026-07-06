-- Persisted conversation history per tenant + Telegram chat
CREATE TABLE IF NOT EXISTS conversation_state (
  tenant_id  TEXT        NOT NULL,
  chat_id    TEXT        NOT NULL,
  messages   JSONB       NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_state_tenant ON conversation_state (tenant_id);
