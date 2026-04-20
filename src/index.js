require('dotenv').config()

const express = require('express')
const { connectDB } = require('./config/db')

const app = express()
let dbConnected = false

app.get('/', (req, res) => {
  res.send('API running')
})

app.get('/health', (req, res) => {
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    database: dbConnected ? 'connected' : 'disconnected'
  })
})

const PORT = process.env.PORT || 3000
const START_WITHOUT_DB = process.env.START_WITHOUT_DB === 'true'
const DB_RETRY_MS = Number(process.env.DB_RETRY_MS || 15000)

async function connectDatabase() {
  try {
    await connectDB()
    dbConnected = true
    return true
  } catch (error) {
    dbConnected = false
    console.error('Failed to connect to database:', error.message)
    return false
  }
}

function scheduleReconnect() {
  if (!START_WITHOUT_DB) {
    return
  }

  setTimeout(async () => {
    const connected = await connectDatabase()

    if (!connected) {
      console.warn(`Database still unavailable. Retrying in ${DB_RETRY_MS}ms...`)
      scheduleReconnect()
      return
    }

    console.log('Database reconnected')
  }, DB_RETRY_MS)
}

async function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
  })

  const connected = await connectDatabase()

  if (!connected && !START_WITHOUT_DB) {
    server.close(() => {
      process.exit(1)
    })
    return
  }

  if (!connected && START_WITHOUT_DB) {
    console.warn('Running without database connection (START_WITHOUT_DB=true)')
    scheduleReconnect()
  }
}

startServer()
