require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
})

async function connectDB() {
  try {
    console.log('Connecting to DB...')
    await pool.query('SELECT 1')
    console.log('PostgreSQL connected successfully')
  } catch (err) {
    console.error('DB ERROR:', err.message)
  }
}

module.exports = {
  pool,
  connectDB
}
