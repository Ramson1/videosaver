-- ============================================
-- VideoSaver Database Schema
-- Supabase PostgreSQL Migration
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Users ─────────────────────────────────
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  username VARCHAR(100) UNIQUE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  auth_provider VARCHAR(50) NOT NULL DEFAULT 'email',
  auth_provider_id VARCHAR(255),
  tier VARCHAR(20) NOT NULL DEFAULT 'free',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  daily_download_count INT NOT NULL DEFAULT 0,
  daily_reset_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 day'),
  total_downloads BIGINT NOT NULL DEFAULT 0,
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tier ON users(tier);
CREATE INDEX idx_users_active ON users(is_active);

-- ─── Platforms ─────────────────────────────
CREATE TABLE platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_available BOOLEAN NOT NULL DEFAULT true,
  supported_types TEXT[] NOT NULL DEFAULT '{}',
  daily_downloads BIGINT NOT NULL DEFAULT 0,
  total_downloads BIGINT NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed platforms
INSERT INTO platforms (name, display_name, supported_types) VALUES
  ('facebook', 'Facebook', ARRAY['video', 'reel', 'photo']),
  ('instagram', 'Instagram', ARRAY['reel', 'post', 'carousel', 'image', 'video']),
  ('tiktok', 'TikTok', ARRAY['video', 'slideshow', 'image']),
  ('youtube', 'YouTube', ARRAY['video', 'short']),
  ('pinterest', 'Pinterest', ARRAY['pin', 'video_pin', 'image_pin']),
  ('twitter', 'X (Twitter)', ARRAY['video', 'gif', 'image']),
  ('linkedin', 'LinkedIn', ARRAY['video', 'image']),
  ('snapchat', 'Snapchat', ARRAY['spotlight', 'story']),
  ('whatsapp', 'WhatsApp', ARRAY['status_image', 'status_video']);

-- ─── Downloads ─────────────────────────────
CREATE TABLE downloads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  platform_id UUID REFERENCES platforms(id),
  job_id VARCHAR(100) NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  media_id VARCHAR(255) NOT NULL,
  title TEXT,
  media_type VARCHAR(50) NOT NULL,
  quality VARCHAR(20) NOT NULL,
  format VARCHAR(20) NOT NULL,
  file_size_bytes BIGINT,
  duration_seconds INT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  storage_path TEXT,
  storage_url TEXT,
  signed_url TEXT,
  signed_url_expires_at TIMESTAMPTZ,
  thumbnail_path TEXT,
  thumbnail_url TEXT,
  ip_address INET,
  user_agent TEXT,
  processing_time_ms INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_downloads_user ON downloads(user_id);
CREATE INDEX idx_downloads_platform ON downloads(platform_id);
CREATE INDEX idx_downloads_status ON downloads(status);
CREATE INDEX idx_downloads_job ON downloads(job_id);
CREATE INDEX idx_downloads_created ON downloads(created_at DESC);
CREATE INDEX idx_downloads_media_id ON downloads(media_id);

-- ─── Media Files ───────────────────────────
CREATE TABLE media_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  download_id UUID REFERENCES downloads(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  format VARCHAR(20) NOT NULL,
  mime_type VARCHAR(100),
  quality VARCHAR(20),
  width INT,
  height INT,
  duration_seconds INT,
  is_thumbnail BOOLEAN NOT NULL DEFAULT false,
  storage_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_download ON media_files(download_id);
CREATE INDEX idx_media_thumbnail ON media_files(is_thumbnail);

-- ─── Favorites ─────────────────────────────
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  download_id UUID NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, download_id)
);

CREATE INDEX idx_favorites_user ON favorites(user_id);

-- ─── Queue Jobs ────────────────────────────
CREATE TABLE queue_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_name VARCHAR(100) NOT NULL,
  job_name VARCHAR(100) NOT NULL,
  bull_job_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  priority INT NOT NULL DEFAULT 0,
  delay_ms INT,
  progress INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_queue_status ON queue_jobs(status);
CREATE INDEX idx_queue_name ON queue_jobs(queue_name);

-- ─── API Keys ──────────────────────────────
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rate_limit INT NOT NULL DEFAULT 1000,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

-- ─── Analytics ─────────────────────────────
CREATE TABLE analytics_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  platform_id UUID REFERENCES platforms(id),
  total_downloads INT NOT NULL DEFAULT 0,
  successful_downloads INT NOT NULL DEFAULT 0,
  failed_downloads INT NOT NULL DEFAULT 0,
  unique_users INT NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  avg_processing_time_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date, platform_id)
);

CREATE INDEX idx_analytics_date ON analytics_daily(date DESC);
CREATE INDEX idx_analytics_platform ON analytics_daily(platform_id);

-- ─── Settings ──────────────────────────────
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default settings
INSERT INTO settings (key, value, description) VALUES
  ('rate_limit_guest', '{"daily": 10}', 'Daily download limit for guest users'),
  ('rate_limit_free', '{"daily": 100}', 'Daily download limit for free users'),
  ('rate_limit_premium', '{"daily": -1}', 'Daily download limit for premium users (-1 = unlimited)'),
  ('storage_cleanup', '{"interval_hours": 24, "max_age_hours": 48}', 'Temporary file cleanup settings'),
  ('maintenance_mode', '{"enabled": false, "message": ""}', 'Maintenance mode toggle');

-- ─── Audit Logs ────────────────────────────
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ─── Storage Usage ─────────────────────────
CREATE TABLE storage_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  file_count INT NOT NULL DEFAULT 0,
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─── Updated At Trigger ────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER platforms_updated_at BEFORE UPDATE ON platforms FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Daily Counter Reset Function ──────────
CREATE OR REPLACE FUNCTION reset_daily_counters()
RETURNS void AS $$
BEGIN
  UPDATE users
  SET daily_download_count = 0
  WHERE daily_reset_at <= NOW();

  UPDATE users
  SET daily_reset_at = NOW() + INTERVAL '1 day'
  WHERE daily_reset_at <= NOW();
END;
$$ LANGUAGE plpgsql;
