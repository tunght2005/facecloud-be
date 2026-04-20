const { pool } = require('../config/db')
const bcrypt = require('bcrypt')

// 1. Lấy danh sách tất cả user (Chỉ dành cho Admin)
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.user_id, u.user_code, u.email, u.full_name, u.class_id, u.user_status, u.created_at,
             array_agg(r.role_name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.role_id
      GROUP BY u.user_id
      ORDER BY u.created_at DESC
    `)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// 1.1 Lấy chi tiết 1 user theo ID (Chỉ dành cho Admin)
const getUserById = async (req, res) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      `SELECT u.user_id, u.user_code, u.email, u.full_name, u.avatar_url, u.class_id, u.user_status, u.created_at,
              array_remove(array_agg(r.role_name), NULL) as roles
       FROM users u
       LEFT JOIN user_roles ur ON u.user_id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.role_id
       WHERE u.user_id = $1
       GROUP BY u.user_id`,
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' })
    }

    return res.json(result.rows[0])
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// 2. Cập nhật thông tin user (Ví dụ: Gán class_id cho sinh viên)
const updateUser = async (req, res) => {
  try {
    const { id } = req.params // Lấy ID từ URL (vd: /users/5)
    const { full_name, class_id, user_status } = req.body

    const result = await pool.query(
      'UPDATE users SET full_name = $1, class_id = $2, user_status = $3 WHERE user_id = $4 RETURNING user_id, email, full_name, class_id, user_status',
      [full_name, class_id, user_status, id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' })
    }

    res.json({ message: 'Cập nhật thành công', user: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// 3. Tạo người dùng mới (Dành cho Admin hoặc để Khởi tạo dữ liệu)
const createUser = async (req, res) => {
  try {
    const { email, password, full_name, user_code, class_id, role_name } = req.body

    // 1. Kiểm tra đầu vào tối thiểu
    if (!email || !password || !role_name) {
      return res.status(400).json({ error: 'Email, password và role_name là bắt buộc' })
    }

    // 2. Kiểm tra email đã tồn tại chưa
    const userExist = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'Email này đã được sử dụng' })
    }

    // 3. Kiểm tra role_name có hợp lệ không (chỉ nhận admin, teacher, student)
    const roleExist = await pool.query('SELECT role_id FROM roles WHERE role_name = $1', [role_name])
    if (roleExist.rows.length === 0) {
      return res.status(400).json({ error: 'Role không hợp lệ' })
    }

    // 4. Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10)
    const password_hash = await bcrypt.hash(password, salt)

    // 5. Lưu vào bảng users
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, full_name, user_code, class_id) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, email, full_name, user_code',
      [email, password_hash, full_name, user_code, class_id || null]
    )
    const newUser = result.rows[0]

    // 6. Gán role cho user vào bảng user_roles
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
      newUser.user_id,
      roleExist.rows[0].role_id
    ])

    res.status(201).json({ message: 'Tạo người dùng thành công', user: { ...newUser, role: role_name } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// 4. Xóa người dùng (Chỉ Admin)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query('DELETE FROM users WHERE user_id = $1 RETURNING user_id', [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng để xóa' })
    }

    res.json({ message: 'Xóa người dùng thành công', deleted_id: result.rows[0].user_id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAllUsers, getUserById, updateUser, createUser, deleteUser }
