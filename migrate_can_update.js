const { pool } = require('./src/config/db')

async function migrate() {
  try {
    console.log('Adding can_update_face column to users table...')
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS can_update_face BOOLEAN DEFAULT FALSE')
    console.log('Migration successful!')
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

migrate()
