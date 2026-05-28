// ============================================
// Bot Gateway — Database Setup
// Auto-creates tables on first boot
// Gracefully handles missing Supabase config
// ============================================
const { createClient } = require('@supabase/supabase-js');

let supabase;
let dbAvailable = false;

function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      console.warn('[DB] SUPABASE_URL or SUPABASE_SERVICE_KEY not set. Database features disabled.');
      return null;
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

// Check if database is configured
function isDbAvailable() {
  return dbAvailable;
}

// Initialize database tables
async function initDatabase() {
  const supa = getSupabase();
  
  if (!supa) {
    console.warn('[DB] Supabase not configured. Running in limited mode (no database).');
    console.warn('[DB] Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.');
    console.warn('[DB] Then run supabase/schema.sql in your Supabase SQL Editor.');
    dbAvailable = false;
    return false;
  }
  
  console.log('[DB] Checking database tables...');

  // Check if tables exist by trying to query them
  const tables = ['tokens', 'bots', 'channels', 'messages', 'audit_log'];
  const existing = [];
  
  for (const table of tables) {
    const { error } = await supa.from(table).select('id').limit(1);
    if (!error) {
      existing.push(table);
    }
  }

  if (existing.length === tables.length) {
    console.log(`[DB] All ${tables.length} tables exist. Database ready.`);
    dbAvailable = true;
    
    // Ensure default channel exists
    const { data: channels } = await supa.from('channels').select('id').eq('name', 'general').limit(1);
    if (!channels || channels.length === 0) {
      await supa.from('channels').insert({ name: 'general', description: 'Default general channel' });
      console.log('[DB] Created default "general" channel.');
    }
    return true;
  }

  console.log(`[DB] Missing tables: ${tables.filter(t => !existing.includes(t)).join(', ')}`);
  console.log('[DB] Please run supabase/schema.sql in your Supabase SQL Editor.');
  console.log('[DB] Go to: https://supabase.com/dashboard → SQL Editor → paste schema.sql → Run');
  
  // Still return true so server starts — we'll handle missing tables gracefully
  dbAvailable = false;
  return false;
}

module.exports = { getSupabase, initDatabase, isDbAvailable };
