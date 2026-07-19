import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function seedPlatforms(): Promise<void> {
  console.log('Seeding platforms...');

  const platforms = [
    { name: 'facebook', display_name: 'Facebook', supported_types: ['video', 'reel', 'photo'] },
    { name: 'instagram', display_name: 'Instagram', supported_types: ['reel', 'post', 'carousel', 'image', 'video'] },
    { name: 'tiktok', display_name: 'TikTok', supported_types: ['video', 'slideshow', 'image'] },
    { name: 'youtube', display_name: 'YouTube', supported_types: ['video', 'short'] },
    { name: 'pinterest', display_name: 'Pinterest', supported_types: ['pin', 'video_pin', 'image_pin'] },
    { name: 'twitter', display_name: 'X (Twitter)', supported_types: ['video', 'gif', 'image'] },
    { name: 'linkedin', display_name: 'LinkedIn', supported_types: ['video', 'image'] },
    { name: 'snapchat', display_name: 'Snapchat', supported_types: ['spotlight', 'story'] },
    { name: 'whatsapp', display_name: 'WhatsApp', supported_types: ['status_image', 'status_video'] },
  ];

  for (const platform of platforms) {
    const { error } = await supabase
      .from('platforms')
      .upsert(platform, { onConflict: 'name' });

    if (error) {
      console.error(`Error seeding platform ${platform.name}:`, error);
    } else {
      console.log(`Seeded platform: ${platform.name}`);
    }
  }
}

async function seedSettings(): Promise<void> {
  console.log('Seeding settings...');

  const settings: Array<{ key: string; value: Record<string, any>; description: string }> = [
    {
      key: 'rate_limit_guest',
      value: { daily: 10 },
      description: 'Daily download limit for guest users',
    },
    {
      key: 'rate_limit_free',
      value: { daily: 100 },
      description: 'Daily download limit for free users',
    },
    {
      key: 'rate_limit_premium',
      value: { daily: -1 },
      description: 'Daily download limit for premium users (-1 = unlimited)',
    },
    {
      key: 'storage_cleanup',
      value: { interval_hours: 24, max_age_hours: 48 },
      description: 'Temporary file cleanup settings',
    },
    {
      key: 'maintenance_mode',
      value: { enabled: false, message: '' },
      description: 'Maintenance mode toggle',
    },
  ];

  for (const setting of settings) {
    const { error } = await supabase
      .from('settings')
      .upsert(setting, { onConflict: 'key' });

    if (error) {
      console.error(`Error seeding setting ${setting.key}:`, error);
    } else {
      console.log(`Seeded setting: ${setting.key}`);
    }
  }
}

async function seedAdminUser(): Promise<void> {
  console.log('Seeding admin user...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@videosaver.com';

  // Check if admin already exists
  const { data: existingAdmin } = await supabase
    .from('users')
    .select('id')
    .eq('email', adminEmail)
    .single();

  if (existingAdmin) {
    console.log('Admin user already exists');
    return;
  }

  const { error } = await supabase.from('users').insert({
    email: adminEmail,
    username: 'admin',
    display_name: 'Administrator',
    auth_provider: 'email',
    tier: 'premium',
    is_active: true,
    is_admin: true,
  });

  if (error) {
    console.error('Error seeding admin user:', error);
  } else {
    console.log(`Seeded admin user: ${adminEmail}`);
  }
}

async function main(): Promise<void> {
  try {
    console.log('Starting database seeding...');
    
    await seedPlatforms();
    await seedSettings();
    await seedAdminUser();

    console.log('Database seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

main();
