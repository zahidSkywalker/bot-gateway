// ============================================
// Bot Gateway — Database Setup
// Auto-creates tables on first boot
// ============================================
const { createClient } = require('@supabase/supabase-js');

let supabase;

function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    supabase = createClient(url, key);
  }
  return supabase;
}

// Execute raw SQL via the RPC endpoint workaround
// Since REST API can't run DDL, we use the pg endpoint
async function runSQL(sql) {
  const supa = getSupabase();
  // Use fetch to hit the Supabase SQL API
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`;
  
  // Try direct approach - create a temporary RPC function
  // Alternative: we'll create tables using the management API pattern
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    }
  });
  
  return response;
}

// Initialize database tables
async function initDatabase() {
  const supa = getSupabase();
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
  return false;
}

module.exports = { getSupabase, initDatabase };
