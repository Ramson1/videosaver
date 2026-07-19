import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

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

async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found');
    return;
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    console.log('No migration files found');
    return;
  }

  console.log(`Found ${migrationFiles.length} migration file(s)`);

  // Check if migrations tracking table exists
  const { data: tableExists } = await supabase
    .from('applied_migrations')
    .select('id')
    .limit(1);

  if (!tableExists) {
    console.log('Creating migrations tracking table...');
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS applied_migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) UNIQUE NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    });
    
    if (error && !error.message.includes('does not exist')) {
      console.error('Error creating migrations table:', error);
    }
  }

  // Get already applied migrations
  const { data: appliedMigrations } = await supabase
    .from('applied_migrations')
    .select('filename');

  const appliedSet = new Set(appliedMigrations?.map(m => m.filename) || []);

  for (const file of migrationFiles) {
    if (appliedSet.has(file)) {
      console.log(`Skipping already applied: ${file}`);
      continue;
    }

    console.log(`Applying migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    try {
      // Execute migration
      const { error } = await supabase.rpc('exec_sql', { sql });
      
      if (error) {
        console.error(`Error applying ${file}:`, error);
        throw error;
      }

      // Record migration
      const { error: recordError } = await supabase
        .from('applied_migrations')
        .insert({ filename: file });

      if (recordError) {
        console.error(`Error recording migration ${file}:`, recordError);
        throw recordError;
      }

      console.log(`Successfully applied: ${file}`);
    } catch (error) {
      console.error(`Migration failed: ${file}`);
      throw error;
    }
  }

  console.log('All migrations completed successfully');
}

// Helper function to execute raw SQL (needs to be created in Supabase)
async function ensureExecSqlFunction(): Promise<void> {
  const { error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1' });
  
  if (error && error.message.includes('does not exist')) {
    console.log('Creating exec_sql function...');
    // This needs to be run manually in Supabase SQL editor:
    console.log(`
      Please run this SQL in your Supabase SQL editor:
      
      CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
      RETURNS VOID AS $$
      BEGIN
        EXECUTE sql;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
  }
}

async function main(): Promise<void> {
  try {
    await ensureExecSqlFunction();
    await runMigrations();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
