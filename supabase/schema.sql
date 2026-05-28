-- ============================================
-- Bot Gateway — Database Schema
-- Supabase (PostgreSQL)
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Tokens Table
-- ============================================
CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,        -- hashed token key (never stored plain)
  key_prefix TEXT NOT NULL,             -- first 8 chars for identification (e.g. "bg_xK9m...")
  permissions JSONB NOT NULL DEFAULT '{"read": true, "write": false, "admin": false}',
  created_by TEXT DEFAULT 'system',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Bots Table
-- ============================================
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  token_id UUID REFERENCES tokens(id) ON DELETE CASCADE,
  description TEXT,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'suspended')),
  metadata JSONB DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. Channels Table
-- ============================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. Messages Table
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  bot_name TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'json', 'embed')),
  source TEXT DEFAULT 'api' CHECK (source IN ('api', 'websocket', 'system')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. Audit Log Table
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  actor TEXT,
  actor_type TEXT DEFAULT 'system' CHECK (actor_type IN ('system', 'admin', 'bot', 'token')),
  detail JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tokens_key_hash ON tokens(key_hash);
CREATE INDEX IF NOT EXISTS idx_tokens_is_active ON tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_bots_token_id ON bots(token_id);
CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- ============================================
-- RLS (Row Level Security) — using service_role bypasses this
-- ============================================
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
CREATE POLICY "Service role full access on tokens" ON tokens FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on bots" ON bots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on channels" ON channels FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on messages" ON messages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on audit_log" ON audit_log FOR ALL USING (auth.role() = 'service_role');

-- Allow anon read access for messages and channels (public endpoints)
CREATE POLICY "Anon read messages" ON messages FOR SELECT USING (auth.role() = 'anon');
CREATE POLICY "Anon read channels" ON channels FOR SELECT USING (auth.role() = 'anon');

-- ============================================
-- Default Channel
-- ============================================
INSERT INTO channels (name, description) VALUES ('general', 'Default general channel') ON CONFLICT DO NOTHING;

-- ============================================
-- Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tokens_updated_at BEFORE UPDATE ON tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER bots_updated_at BEFORE UPDATE ON bots FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER channels_updated_at BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();
