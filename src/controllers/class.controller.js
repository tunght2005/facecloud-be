const { pool } = require('../config/db')
const { writeAuditLog } = require('../utils/audit-log')

const applyTeacherScope = (req, query, params) => {
  const isAdmin = req.user?.roles?.includes('admin')
  const isTeacher = req.user?.roles?.includes('teacher')

  if (!isAdmin && isTeacher) {
    query += ` AND c.teacher_id = $${params.length + 1}`
    params.push(req.user.user_id)
  }

  return { query, params }
}
// [GET] /api/classes
const getClasses = async (req, res) => {
  try {
    const { q, page = 1, limit = 10 } = req.query
    const offset = (page - 1) * limit
    const params = []
    let whereClause = 'WHERE 1=1'

    if (q) {
      whereClause += ` AND c.class_name ILIKE $${params.length + 1}`
      params.push(`%${q}%`)
    }

    const scoped = applyTeacherScope(req, whereClause, params)
    whereClause = scoped.query

    const query = `
      SELECT 
        c.class_id, c.class_name, c.teacher_id, c.created_at, 
        t.full_name AS teacher_name,
        COUNT(s.user_id) AS student_count,
        count(*) OVER() AS total_count
      FROM classes c
      LEFT JOIN users t ON c.teacher_id = t.user_id
      LEFT JOIN users s ON c.class_id = s.class_id
      ${whereClause}
      GROUP BY c.class_id, t.full_name
      ORDER BY c.created_at DESC
      LIMIT $${scoped.params.length + 1} OFFSET $${scoped.params.length + 2}
    `
    const finalParams = [...scoped.params, limit, offset]

    const result = await pool.query(query, finalParams)
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / limit)
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message })
  }
}

// [POST] /api/classes
// Tạo một lớp học mới
const createClass = async (req, res) => {
  try {
    // Nhận thêm student_ids (là một mảng các ID của học sinh)
    const { class_name, teacher_id, student_ids } = req.body
    const isAdmin = req.user?.roles?.includes('admin')
    const ownerTeacherId = isAdmin ? teacher_id || null : req.user.user_id

    if (!class_name) {
      return res.status(400).json({ success: false, message: 'Tên lớp không được để trống' })
    }

    // Bước 1: Tạo lớp học mới
    const classQuery = `
            INSERT INTO classes (class_name, teacher_id) 
            VALUES ($1, $2) 
            RETURNING *;
        `
    const classRes = await pool.query(classQuery, [class_name, ownerTeacherId])
    const newClass = classRes.rows[0]

    // Bước 2: Nếu có mảng student_ids, cập nhật class_id cho các học sinh đó
    if (student_ids && Array.isArray(student_ids) && student_ids.length > 0) {
      const updateStudentsQuery = `
                UPDATE users 
                SET class_id = $1 
                WHERE user_id = ANY($2::int[])
            `
      // ANY($2::int[]) là cú pháp của PostgreSQL để check giá trị nằm trong mảng
      await pool.query(updateStudentsQuery, [newClass.class_id, student_ids])

      // Gắn thêm thông tin trả về cho Frontend biết là đã add bao nhiêu em
      newClass.added_student_count = student_ids.length
      newClass.added_student_ids = student_ids
    }

    await writeAuditLog({
      userId: req.user?.user_id,
      actionName: 'class.create',
      actionData: {
        class_id: newClass.class_id,
        class_name: newClass.class_name,
        teacher_id: newClass.teacher_id || null
      }
    })

    res.status(201).json({
      success: true,
      message: 'Tạo lớp thành công',
      data: newClass
    })
  } catch (error) {
    // Bắt lỗi nếu teacher_id không tồn tại trong bảng users
    if (error.code === '23503') {
      return res.status(400).json({ success: false, message: 'Giáo viên (teacher_id) không tồn tại' })
    }
    res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message })
  }
}

// [GET] /api/classes/:id
// Lấy thông tin chi tiết của 1 lớp học (Kèm luôn danh sách chi tiết học sinh)
const getClassById = async (req, res) => {
  try {
    const { id } = req.params

    const accessParams = [id]
    let accessWhere = `c.class_id = $1`
    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')
    if (!isAdmin && isTeacher) {
      accessWhere += ` AND c.teacher_id = $2`
      accessParams.push(req.user.user_id)
    }

    const query = `
            SELECT 
                c.class_id, c.class_name, c.created_at,
                c.teacher_id,
                t.full_name AS teacher_name,
                COALESCE(
                    (SELECT json_agg(
                        json_build_object(
                            'user_id', s.user_id, 
                            'user_code', s.user_code, 
                            'full_name', s.full_name
                        )
                    ) 
                    FROM users s WHERE s.class_id = c.class_id), 
                    '[]'::json
                ) AS students
            FROM classes c
            LEFT JOIN users t ON c.teacher_id = t.user_id
            WHERE ${accessWhere};
        `
    const { rows } = await pool.query(query, accessParams)

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học' })
    }

    res.status(200).json({ success: true, data: rows[0] })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message })
  }
}

// [GET] /api/classes/:id/students
// Lấy danh sách học sinh thuộc lớp học đó
const getClassStudents = async (req, res) => {
  try {
    const classId = req.params.id

    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    if (!isAdmin && isTeacher) {
      const classAccess = await pool.query(
        'SELECT class_id FROM classes WHERE class_id = $1 AND teacher_id = $2 LIMIT 1',
        [classId, req.user.user_id]
      )
      if (classAccess.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Bạn chỉ được xem học sinh lớp của mình' })
      }
    }

    // Dev 1 quản lý bảng users, ta chỉ SELECT những thông tin cơ bản của học sinh
    const query = `
            SELECT user_id, user_code, email, full_name, avatar_url, user_status 
            FROM users 
            WHERE class_id = $1;
        `
    const { rows } = await pool.query(query, [classId])

    res.status(200).json({ success: true, data: rows })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message })
  }
}

const assignStudentsToClass = async (req, res) => {
  try {
    const classId = Number(req.params.id)
    const { student_ids } = req.body

    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'student_ids phải là mảng và không được rỗng' })
    }

    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    if (!isAdmin && isTeacher) {
      const classAccess = await pool.query(
        'SELECT class_id FROM classes WHERE class_id = $1 AND teacher_id = $2 LIMIT 1',
        [classId, req.user.user_id]
      )
      if (classAccess.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Bạn chỉ được thêm học sinh vào lớp của mình' })
      }
    }

    const normalizedIds = student_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    if (!normalizedIds.length) {
      return res.status(400).json({ success: false, message: 'student_ids không hợp lệ' })
    }

    const roleCheck = await pool.query(
      `SELECT u.user_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.user_id = ANY($1::int[]) AND r.role_name = 'student'`,
      [normalizedIds]
    )

    const studentIdSet = new Set(roleCheck.rows.map((row) => row.user_id))
    const validStudentIds = normalizedIds.filter((id) => studentIdSet.has(id))

    if (!validStudentIds.length) {
      return res.status(400).json({ success: false, message: 'Không có student hợp lệ để thêm vào lớp' })
    }

    await pool.query('UPDATE users SET class_id = $1 WHERE user_id = ANY($2::int[])', [classId, validStudentIds])

    await writeAuditLog({
      userId: req.user?.user_id,
      actionName: 'class.assign_students',
      actionData: {
        class_id: classId,
        added_student_ids: validStudentIds
      }
    })

    return res.status(200).json({
      success: true,
      message: 'Thêm học sinh vào lớp thành công',
      class_id: classId,
      added_student_ids: validStudentIds
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message })
  }
}

const updateClass = async (req, res) => {
  try {
    const classId = Number(req.params.id)
    const { class_name, teacher_id } = req.body

    if (!class_name || !String(class_name).trim()) {
      return res.status(400).json({ success: false, message: 'Tên lớp không được để trống' })
    }

    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')
    const ownerTeacherId = isAdmin ? teacher_id || null : req.user.user_id

    if (!isAdmin && isTeacher) {
      const classAccess = await pool.query(
        'SELECT class_id FROM classes WHERE class_id = $1 AND teacher_id = $2 LIMIT 1',
        [classId, req.user.user_id]
      )
      if (classAccess.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Bạn chỉ được sửa lớp của mình' })
      }
    }

    const result = await pool.query(
      `UPDATE classes
       SET class_name = $1, teacher_id = $2
       WHERE class_id = $3
       RETURNING *`,
      [class_name.trim(), ownerTeacherId, classId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học' })
    }

    await writeAuditLog({
      userId: req.user?.user_id,
      actionName: 'class.update',
      actionData: {
        class_id: classId,
        class_name: class_name.trim(),
        teacher_id: ownerTeacherId
      }
    })

    return res.status(200).json({ success: true, message: 'Cập nhật lớp thành công', data: result.rows[0] })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message })
  }
}

const deleteClass = async (req, res) => {
  try {
    const classId = Number(req.params.id)
    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    if (!isAdmin && isTeacher) {
      const classAccess = await pool.query(
        'SELECT class_id FROM classes WHERE class_id = $1 AND teacher_id = $2 LIMIT 1',
        [classId, req.user.user_id]
      )
      if (classAccess.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Bạn chỉ được xóa lớp của mình' })
      }
    }

    await pool.query('UPDATE users SET class_id = NULL WHERE class_id = $1', [classId])
    const result = await pool.query('DELETE FROM classes WHERE class_id = $1 RETURNING class_id, class_name', [classId])

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học' })
    }

    await writeAuditLog({
      userId: req.user?.user_id,
      actionName: 'class.delete',
      actionData: {
        class_id: classId,
        class_name: result.rows[0].class_name
      }
    })

    return res.status(200).json({ success: true, message: 'Xóa lớp thành công', data: result.rows[0] })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message })
  }
}

module.exports = {
  getClasses,
  createClass,
  getClassById,
  getClassStudents,
  assignStudentsToClass,
  updateClass,
  deleteClass
}
