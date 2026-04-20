require('dotenv').config()
const express = require('express')
const { connectDB, pool } = require('./config/db')

const app = express()

app.get('/', (req, res) => {
  res.send('Server running...')
})

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)
  await connectDB()
})
