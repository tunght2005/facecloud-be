const { pool } = require('../config/db')
const bcrypt = require('bcrypt')
const { writeAuditLog } = require('../utils/audit-log')

// 1. Lấy danh sách tất cả user (Chỉ dành cho Admin)
const getAllUsers = async (req, res) => {
  try {
    const { q, role, status, page = 1, limit = 10 } = req.query
    const offset = (page - 1) * limit
    const params = []
    let whereClause = 'WHERE 1=1'

    if (q) {
      whereClause += ` AND (u.full_name ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1} OR u.user_code ILIKE $${params.length + 1})`
      params.push(`%${q}%`)
    }

    if (status) {
      whereClause += ` AND u.user_status = $${params.length + 1}`
      params.push(status)
    }

    // Role filter requires a subquery or HAVING since roles are aggregated
    let roleFilter = ''
    if (role) {
      roleFilter = `HAVING array_agg(r.role_name) @> $${params.length + 1}::varchar[]`
      params.push([role])
    }

    const query = `
      SELECT u.user_id, u.user_code, u.email, u.full_name, u.class_id, u.user_status, u.created_at,
             array_agg(r.role_name) as roles,
             count(*) OVER() AS total_count
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.role_id
      ${whereClause}
      GROUP BY u.user_id
      ${roleFilter}
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `
    params.push(limit, offset)

    const result = await pool.query(query, params)
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0

    res.json({
      users: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / limit)
      }
    })
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

const getTeachers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.user_code
       FROM users u
       JOIN user_roles ur ON u.user_id = ur.user_id
       JOIN roles r ON ur.role_id = r.role_id
       WHERE r.role_name = 'teacher'
       ORDER BY u.full_name ASC`
    )

    return res.json(result.rows)
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

    await writeAuditLog({
      userId: req.user?.user_id,
      actionName: 'user.update',
      actionData: {
        updated_user_id: Number(id),
        class_id,
        user_status
      }
    })
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

    await writeAuditLog({
      userId: req.user?.user_id,
      actionName: 'user.create',
      actionData: {
        created_user_id: newUser.user_id,
        role_name,
        class_id: class_id || null
      }
    })

    res.status(201).json({ message: 'Tạo người dùng thành công', user: { ...newUser, role: role_name } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createStudentInClass = async (req, res) => {
  try {
    const { email, password, full_name, user_code, class_id } = req.body

    if (!email || !password || !full_name || !user_code || !class_id) {
      return res.status(400).json({ error: 'email, password, full_name, user_code, class_id là bắt buộc' })
    }

    const classId = Number(class_id)
    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({ error: 'class_id không hợp lệ' })
    }

    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    if (!isAdmin && isTeacher) {
      const classAccess = await pool.query(
        'SELECT class_id FROM classes WHERE class_id = $1 AND teacher_id = $2 LIMIT 1',
        [classId, req.user.user_id]
      )
      if (classAccess.rows.length === 0) {
        return res.status(403).json({ error: 'Bạn chỉ được tạo học sinh trong lớp của mình' })
      }
    }

    const userExist = await pool.query('SELECT user_id FROM users WHERE email = $1 OR user_code = $2 LIMIT 1', [
      email,
      user_code
    ])
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'Email hoặc mã người dùng đã tồn tại' })
    }

    const salt = await bcrypt.genSalt(10)
    const password_hash = await bcrypt.hash(password, salt)

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, user_code, class_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, email, full_name, user_code, class_id`,
      [email, password_hash, full_name, user_code, classId]
    )
    const newUser = result.rows[0]

    const roleResult = await pool.query("SELECT role_id FROM roles WHERE role_name = 'student' LIMIT 1")
    if (roleResult.rows.length === 0) {
      return res.status(500).json({ error: 'Không tìm thấy role student' })
    }

    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
      newUser.user_id,
      roleResult.rows[0].role_id
    ])

    await writeAuditLog({
      userId: req.user?.user_id,
      actionName: 'student.create',
      actionData: {
        created_user_id: newUser.user_id,
        class_id: classId
      }
    })

    return res.status(201).json({ message: 'Tạo tài khoản học sinh thành công', user: { ...newUser, role: 'student' } })
  } catch (err) {
    return res.status(500).json({ error: err.message })
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

    await writeAuditLog({
      userId: req.user?.user_id,
      actionName: 'user.delete',
      actionData: {
        deleted_user_id: Number(id)
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// 5. Tìm user theo email (dùng cho flow thêm học sinh vào lớp)
const searchByEmail = async (req, res) => {
  try {
    const { q } = req.query
    if (!q || String(q).trim().length < 2) {
      return res.json([])
    }

    const result = await pool.query(
      `SELECT u.user_id, u.user_code, u.email, u.full_name, u.class_id,
              array_remove(array_agg(r.role_name), NULL) as roles
       FROM users u
       LEFT JOIN user_roles ur ON u.user_id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.role_id
       WHERE u.email ILIKE $1
       GROUP BY u.user_id
       ORDER BY u.full_name ASC
       LIMIT 10`,
      [`%${String(q).trim()}%`]
    )

    return res.json(result.rows)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// 6. Lấy lịch sử điểm danh của student đang đăng nhập
const getMyAttendanceHistory = async (req, res) => {
  try {
    const userId = req.user.user_id

    const result = await pool.query(
      `SELECT
         ar.attendance_id, ar.attendance_session_id, ar.check_in_time, ar.attendance_status,
         s.session_date, s.start_time, s.end_time, s.status as session_status,
         c.class_id, c.class_name,
         al.captured_image_url,
         (SELECT MAX(fvl.similarity_score)
          FROM face_verification_logs fvl
          WHERE fvl.user_id = ar.user_id
            AND fvl.verification_status = 'success'
            AND fvl.created_at >= ar.check_in_time - INTERVAL '1 minute'
            AND fvl.created_at <= ar.check_in_time + INTERVAL '1 minute'
         ) as similarity_score
       FROM attendance_records ar
       JOIN attendance_sessions s ON ar.attendance_session_id = s.attendance_session_id
       JOIN classes c ON s.class_id = c.class_id
       LEFT JOIN attendance_logs al ON ar.attendance_id = al.attendance_id
       WHERE ar.user_id = $1
       ORDER BY ar.check_in_time DESC
       LIMIT 50`,
      [userId]
    )

    return res.json({ records: result.rows, total: result.rows.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  getTeachers,
  updateUser,
  createUser,
  createStudentInClass,
  deleteUser,
  searchByEmail,
  getMyAttendanceHistory
}
