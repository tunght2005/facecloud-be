require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { connectDB, pool } = require('./config/db')

const app = express()

// 1. Khai báo các Middleware cơ bản
app.use(cors()) // Cho phép Frontend gọi API
app.use(express.json()) // Phân tích các request có body định dạng JSON (Rất quan trọng cho POST/PUT)
app.use(express.urlencoded({ extended: true })) // Phân tích data từ form (application/x-www-form-urlencoded)

// 2. Định nghĩa các Routes (Tạm thời comment lại, chúng ta sẽ mở ra ở Giai đoạn sau)
const authRoutes = require('./routes/auth.routes')
const userRoutes = require('./routes/user.routes')
const classRoutes = require('./routes/class.routes');
const attendanceRoutes = require('./routes/attendance.routes');

app.use('/auth', authRoutes)
app.use('/users', userRoutes)
app.use('/classes', classRoutes);
app.use('/attendance', attendanceRoutes);
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

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)
  await connectDB()
})

const notificationRoutes = require('./routes/notification.routes') // Thêm dòng này ở trên
app.use('/notifications', notificationRoutes) // Thêm dòng này ở dưới cùng phần định nghĩa route