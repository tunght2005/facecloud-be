const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { pool } = require('../config/db')

// 1. API Đăng ký tài khoản (Register)
const register = async (req, res) => {
  try {
    const { email, password, full_name, user_code } = req.body

    // Kiểm tra dữ liệu đầu vào
    if (!email || !password) {
      return res.status(400).json({ error: 'Email và password là bắt buộc' })
    }

    // Kiểm tra xem email đã tồn tại trong DB chưa
    const userExist = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'Email này đã được sử dụng' })
    }

    // Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10)
    const password_hash = await bcrypt.hash(password, salt)

    // Lưu user vào database
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, full_name, user_code) VALUES ($1, $2, $3, $4) RETURNING user_id, email, full_name',
      [email, password_hash, full_name, user_code]
    )
    const newUser = result.rows[0]

    // Gán role mặc định là 'student' cho user mới đăng ký
    const roleResult = await pool.query("SELECT role_id FROM roles WHERE role_name = 'student'")
    if (roleResult.rows.length > 0) {
      await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
        newUser.user_id,
        roleResult.rows[0].role_id
      ])
    }

    res.status(201).json({ message: 'Đăng ký thành công', user: newUser })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// 2. API Đăng nhập (Login)
const login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email và password là bắt buộc' })
    }

    // Tìm user bằng email
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Sai email hoặc mật khẩu' })
    }
    const user = userResult.rows[0]

    // So sánh mật khẩu người dùng nhập với mật khẩu đã mã hóa trong DB
    const isMatch = await bcrypt.compare(password, user.password_hash)
    if (!isMatch) {
      return res.status(401).json({ error: 'Sai email hoặc mật khẩu' })
    }

    // Lấy danh sách quyền (roles) của user này
    const roleResult = await pool.query(
      `SELECT r.role_name FROM roles r
       JOIN user_roles ur ON r.role_id = ur.role_id
       WHERE ur.user_id = $1`,
      [user.user_id]
    )
    const roles = roleResult.rows.map(row => row.role_name)

    // Tạo JWT Token (thời hạn 1 ngày)
    const token = jwt.sign(
      { user_id: user.user_id, roles: roles, class_id: user.class_id },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    )

    res.json({ 
        message: 'Đăng nhập thành công', 
        token, 
        user: { user_id: user.user_id, email: user.email, full_name: user.full_name, roles } 
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// 3. API Lấy thông tin user đang đăng nhập (Get Me)
const getMe = async (req, res) => {
  try {
    // req.user.user_id được lấy từ middleware requireAuth
    const userId = req.user.user_id
    const userResult = await pool.query(
      'SELECT user_id, user_code, email, full_name, avatar_url, class_id, user_status FROM users WHERE user_id = $1',
      [userId]
    )
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' })
    }

    res.json({ user: userResult.rows[0], roles: req.user.roles })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { register, login, getMe }