const { Pool } = require('pg')

let pool
const CONNECTION_TIMEOUT_MS = Number(process.env.PG_CONNECTION_TIMEOUT_MS || 10000)

function getDbTargetLabel() {
  if (process.env.DATABASE_URL) {
    try {
      const parsed = new URL(process.env.DATABASE_URL)
      return `${parsed.hostname}:${parsed.port || 5432}/${parsed.pathname.replace('/', '')}`
    } catch {
      return 'DATABASE_URL'
    }
  }

  const host = process.env.PGHOST || 'unknown-host'
  const port = process.env.PGPORT || '5432'
  const database = process.env.PGDATABASE || 'unknown-db'

  return `${host}:${port}/${database}`
}

function createPool() {
  const connectionString = process.env.DATABASE_URL

  if (connectionString) {
    return new Pool({
      connectionString,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS
    })
  }

  const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env

  if (!PGHOST || !PGPORT || !PGDATABASE || !PGUSER || !PGPASSWORD) {
    throw new Error('Missing PostgreSQL connection env vars')
  }

  return new Pool({
    host: PGHOST,
    port: Number(PGPORT),
    database: PGDATABASE,
    user: PGUSER,
    password: PGPASSWORD,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS
  })
}

async function connectDB() {
  if (!pool) {
    pool = createPool()
  }

  console.log(`Connecting to PostgreSQL at ${getDbTargetLabel()} ...`)

  await pool.query('SELECT 1')

  console.log('PostgreSQL connected successfully')

  return pool
}

function getDB() {
  if (!pool) {
    throw new Error('Database has not been initialized')
  }

  return pool
}

module.exports = {
  connectDB,
  getDB
}
