-- ============================================
-- VideoSaver Database Schema for Supabase
-- All tables, buckets, and fields prefixed with videosaver_
-- No restrictions - all roles allowed
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Platforms table: Stores supported platforms
CREATE TABLE IF NOT EXISTS videosaver_platforms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  supported_types TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Settings table: Application configuration
CREATE TABLE IF NOT EXISTS videosaver_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table: User accounts and tiers
CREATE TABLE IF NOT EXISTS videosaver_users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  username VARCHAR(100) UNIQUE,
  display_name VARCHAR(255),
  auth_provider VARCHAR(50) DEFAULT 'email',
  tier VARCHAR(20) DEFAULT 'free',
  is_active BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Downloads table: Track all downloads
CREATE TABLE IF NOT EXISTS videosaver_downloads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES videosaver_users(id) ON DELETE SET NULL,
  platform VARCHAR(50) NOT NULL,
  media_id VARCHAR(255) NOT NULL,
  original_url TEXT NOT NULL,
  title TEXT,
  quality VARCHAR(20),
  file_path TEXT,
  file_size BIGINT,
  format VARCHAR(20),
  storage_url TEXT,
  signed_url TEXT,
  signed_url_expires_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  duration INTEGER,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics table: Daily usage statistics
CREATE TABLE IF NOT EXISTS videosaver_analytics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  date DATE NOT NULL,
  platform VARCHAR(50) NOT NULL,
  total_downloads INTEGER DEFAULT 0,
  successful_downloads INTEGER DEFAULT 0,
  failed_downloads INTEGER DEFAULT 0,
  total_data_bytes BIGINT DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date, platform)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_videosaver_downloads_user_id ON videosaver_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_videosaver_downloads_platform ON videosaver_downloads(platform);
CREATE INDEX IF NOT EXISTS idx_videosaver_downloads_status ON videosaver_downloads(status);
CREATE INDEX IF NOT EXISTS idx_videosaver_downloads_created_at ON videosaver_downloads(created_at);
CREATE INDEX IF NOT EXISTS idx_videosaver_analytics_date ON videosaver_analytics(date);
CREATE INDEX IF NOT EXISTS idx_videosaver_analytics_platform ON videosaver_analytics(platform);
CREATE INDEX IF NOT EXISTS idx_videosaver_users_email ON videosaver_users(email);
CREATE INDEX IF NOT EXISTS idx_videosaver_users_username ON videosaver_users(username);

-- ============================================
-- ROW LEVEL SECURITY (RLS) - DISABLED
-- ============================================

-- Disable RLS on all tables (allow all access)
ALTER TABLE videosaver_platforms DISABLE ROW LEVEL SECURITY;
ALTER TABLE videosaver_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE videosaver_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE videosaver_downloads DISABLE ROW LEVEL SECURITY;
ALTER TABLE videosaver_analytics DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STORAGE BUCKET
-- ============================================

-- Create storage bucket for downloads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videosaver_downloads',
  'videosaver_downloads',
  true,
  524288000, -- 500MB
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 
         'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
         'image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET 
  public = true,
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 
                              'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
                              'image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- Disable RLS on storage bucket (allow all access)
-- Note: We create policies instead of disabling RLS on storage.objects

-- Allow all operations on storage.objects for videosaver_downloads bucket
DROP POLICY IF EXISTS "Allow all operations on videosaver_downloads" ON storage.objects;
CREATE POLICY "Allow all operations on videosaver_downloads" ON storage.objects
  FOR ALL
  USING (bucket_id = 'videosaver_downloads')
  WITH CHECK (bucket_id = 'videosaver_downloads');

-- ============================================
-- SEED DATA
-- ============================================

-- Insert platforms
INSERT INTO videosaver_platforms (name, display_name, supported_types) VALUES
  ('facebook', 'Facebook', ARRAY['video', 'reel', 'photo']),
  ('instagram', 'Instagram', ARRAY['reel', 'post', 'carousel', 'image', 'video']),
  ('tiktok', 'TikTok', ARRAY['video', 'slideshow', 'image']),
  ('youtube', 'YouTube', ARRAY['video', 'short']),
  ('pinterest', 'Pinterest', ARRAY['pin', 'video_pin', 'image_pin']),
  ('twitter', 'X (Twitter)', ARRAY['video', 'gif', 'image']),
  ('linkedin', 'LinkedIn', ARRAY['video', 'image']),
  ('snapchat', 'Snapchat', ARRAY['spotlight', 'story']),
  ('whatsapp', 'WhatsApp', ARRAY['status_image', 'status_video'])
ON CONFLICT (name) DO NOTHING;

-- Insert settings
INSERT INTO videosaver_settings (key, value, description) VALUES
  ('rate_limit_guest', '{"daily": 10}', 'Daily download limit for guest users'),
  ('rate_limit_free', '{"daily": 100}', 'Daily download limit for free users'),
  ('rate_limit_premium', '{"daily": -1}', 'Daily download limit for premium users (-1 = unlimited)'),
  ('storage_cleanup', '{"interval_hours": 24, "max_age_hours": 48}', 'Temporary file cleanup settings'),
  ('maintenance_mode', '{"enabled": false, "message": ""}', 'Maintenance mode toggle')
ON CONFLICT (key) DO NOTHING;

-- Insert default admin user
INSERT INTO videosaver_users (email, username, display_name, auth_provider, tier, is_active, is_admin)
VALUES ('admin@videosaver.com', 'admin', 'Administrator', 'email', 'premium', true, true)
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
DROP TRIGGER IF EXISTS trigger_videosaver_platforms_updated_at ON videosaver_platforms;
CREATE TRIGGER trigger_videosaver_platforms_updated_at
  BEFORE UPDATE ON videosaver_platforms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_videosaver_settings_updated_at ON videosaver_settings;
CREATE TRIGGER trigger_videosaver_settings_updated_at
  BEFORE UPDATE ON videosaver_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_videosaver_users_updated_at ON videosaver_users;
CREATE TRIGGER trigger_videosaver_users_updated_at
  BEFORE UPDATE ON videosaver_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_videosaver_downloads_updated_at ON videosaver_downloads;
CREATE TRIGGER trigger_videosaver_downloads_updated_at
  BEFORE UPDATE ON videosaver_downloads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_videosaver_analytics_updated_at ON videosaver_analytics;
CREATE TRIGGER trigger_videosaver_analytics_updated_at
  BEFORE UPDATE ON videosaver_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'VideoSaver database schema created successfully!';
  RAISE NOTICE 'Tables created: videosaver_platforms, videosaver_settings, videosaver_users, videosaver_downloads, videosaver_analytics';
  RAISE NOTICE 'Storage bucket created: videosaver_downloads';
  RAISE NOTICE 'RLS disabled on all tables (no restrictions)';
  RAISE NOTICE 'Seed data inserted';
END $$;
