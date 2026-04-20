require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const { connectDB, pool } = require('./config/db')

const app = express()

// 1. Khai báo các Middleware cơ bản
app.use(cors()) // Cho phép Frontend gọi API
app.use(express.json({ limit: '10mb' })) // Cho phép payload ảnh base64 khi test API nhận diện khuôn mặt
app.use(express.urlencoded({ extended: true, limit: '10mb' })) // Cho phép payload lớn từ form/urlencoded
app.use(express.static(path.join(__dirname, '../public')))

// 2. Định nghĩa các Routes (Tạm thời comment lại, chúng ta sẽ mở ra ở Giai đoạn sau)
const authRoutes = require('./routes/auth.routes')
const userRoutes = require('./routes/user.routes')
const notificationRoutes = require('./routes/notification.routes')
const faceRoutes = require('./routes/face.routes')
const attendanceRoutes = require('./routes/attendance.routes')

app.use('/auth', authRoutes)
app.use('/users', userRoutes)
app.use('/notifications', notificationRoutes)
app.use('/face', faceRoutes)
app.use('/attendance', attendanceRoutes)

// 3. Các API test mặc định
app.get('/', (req, res) => {
  res.send('FaceCloud Server is running...')
})

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api-test', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/api-test.html'))
})

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)
  await connectDB()
})
