// ============================================
// Bot Gateway — Database Setup
// MongoDB (Mongoose) connection
// Auto-creates indexes on first boot
// Ensures default "general" channel exists
// ============================================
const mongoose = require('mongoose');
const { Channel } = require('./models');

let dbAvailable = false;

function getDatabase() {
  return mongoose.connection;
}

// Check if database is available
function isDbAvailable() {
  return dbAvailable;
}

// Initialize database connection and seed defaults
async function initDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn('[DB] MONGODB_URI not set. Database features disabled.');
    console.warn('[DB] Set MONGODB_URI environment variable to connect to MongoDB.');
    dbAvailable = false;
    return false;
  }

  console.log('[DB] Connecting to MongoDB...');

  try {
    await mongoose.connect(uri, {
      dbName: 'bot_gateway',
      autoIndex: true
    });

    dbAvailable = true;
    console.log('[DB] Connected to MongoDB successfully.');

    // Ensure default "general" channel exists
    await Channel.findOneAndUpdate(
      { name: 'general' },
      { name: 'general', description: 'Default general channel' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log('[DB] Default "general" channel ensured.');

    return true;
  } catch (err) {
    console.error('[DB] Failed to connect to MongoDB:', err.message);
    dbAvailable = false;
    return false;
  }
}

// Connection event handlers
mongoose.connection.on('error', (err) => {
  console.error('[DB] MongoDB connection error:', err.message);
  dbAvailable = false;
});

mongoose.connection.on('disconnected', () => {
  console.warn('[DB] MongoDB disconnected.');
  dbAvailable = false;
});

mongoose.connection.on('reconnected', () => {
  console.log('[DB] MongoDB reconnected.');
  dbAvailable = true;
});

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.disconnect();
    console.log('[DB] MongoDB disconnected on SIGINT.');
  } catch (err) {
    console.error('[DB] Error disconnecting MongoDB:', err.message);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  try {
    await mongoose.disconnect();
    console.log('[DB] MongoDB disconnected on SIGTERM.');
  } catch (err) {
    console.error('[DB] Error disconnecting MongoDB:', err.message);
  }
  process.exit(0);
});

module.exports = { getDatabase, initDatabase, isDbAvailable };
