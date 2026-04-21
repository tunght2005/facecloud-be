const { pool } = require('../config/db')
const { searchByImage } = require('../services/rekognition.service')
const { resolveMatchedUserId } = require('./face.controller')
const { writeAuditLog } = require('../utils/audit-log')

const DEFAULT_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 85)

const normalizeSessionTimestamp = (sessionDate, timeValue, fieldName) => {
  if (!timeValue) {
    return null
  }

  const rawValue = String(timeValue).trim()
  if (!rawValue) {
    return null
  }

  // Accept full timestamp directly from client
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(rawValue)) {
    return rawValue
  }

  // Accept time-only values and combine with session_date for TIMESTAMP columns
  if (/^\d{2}:\d{2}$/.test(rawValue)) {
    return `${sessionDate} ${rawValue}:00`
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(rawValue)) {
    return `${sessionDate} ${rawValue}`
  }

  throw new Error(`${fieldName} phải là HH:mm, HH:mm:ss hoặc timestamp đầy đủ`)
}

// ===== QUẢN LÝ BUỔI ĐIỂM DANH (SESSION) =====

const createSession = async (req, res) => {
  try {
    const { class_id, session_date, start_time, end_time } = req.body
    const created_by = req.user.user_id
    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    if (!class_id || !session_date) {
      return res.status(400).json({ error: 'class_id và session_date là bắt buộc' })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(session_date))) {
      return res.status(400).json({ error: 'session_date phải có định dạng YYYY-MM-DD' })
    }

    let startTimestamp
    let endTimestamp
    try {
      startTimestamp = normalizeSessionTimestamp(session_date, start_time, 'start_time')
      endTimestamp = normalizeSessionTimestamp(session_date, end_time, 'end_time')
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message })
    }

    const classResult = await pool.query('SELECT class_id, teacher_id FROM classes WHERE class_id = $1 LIMIT 1', [
      class_id
    ])
    if (classResult.rows.length === 0) {
      return res.status(400).json({ error: `class_id ${class_id} không tồn tại trong bảng classes` })
    }

    if (!isAdmin && isTeacher && classResult.rows[0].teacher_id !== created_by) {
      return res.status(403).json({ error: 'Bạn chỉ được tạo buổi cho lớp của mình' })
    }

    const result = await pool.query(
      `INSERT INTO attendance_sessions (class_id, session_date, start_time, end_time, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, 'planning', $5, NOW())
       RETURNING *`,
      [class_id, session_date, startTimestamp, endTimestamp, created_by]
    )

    await writeAuditLog({
      userId: created_by,
      actionName: 'attendance.session.create',
      actionData: {
        attendance_session_id: result.rows[0].attendance_session_id,
        class_id
      }
    })

    return res.status(201).json({
      message: 'Tạo buổi điểm danh thành công',
      session: result.rows[0]
    })
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ error: 'class_id hoặc created_by không tồn tại (foreign key)' })
    }
    return res.status(500).json({ error: error.message })
  }
}

const openSession = async (req, res) => {
  try {
    const { attendance_session_id } = req.body
    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    if (!attendance_session_id) {
      return res.status(400).json({ error: 'attendance_session_id là bắt buộc' })
    }

    const sessionAccess = await pool.query(
      `SELECT s.attendance_session_id
       FROM attendance_sessions s
       JOIN classes c ON c.class_id = s.class_id
       WHERE s.attendance_session_id = $1
       AND ($2::boolean = true OR ($3::boolean = true AND c.teacher_id = $4))`,
      [attendance_session_id, isAdmin, isTeacher, req.user.user_id]
    )

    if (sessionAccess.rows.length === 0) {
      return res.status(403).json({ error: 'Bạn không có quyền mở buổi điểm danh này' })
    }

    const result = await pool.query(
      `UPDATE attendance_sessions
       SET status = 'open'
       WHERE attendance_session_id = $1 AND status IN ('planning', 'closed')
       RETURNING *`,
      [attendance_session_id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy buổi điểm danh hoặc buổi đã mở' })
    }

    await writeAuditLog({
      userId: req.user?.user_id,
      actionName: 'attendance.session.open',
      actionData: {
        attendance_session_id
      }
    })

    return res.json({
      message: 'Mở buổi điểm danh thành công',
      session: result.rows[0]
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

const closeSession = async (req, res) => {
  try {
    const { attendance_session_id } = req.body
    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    if (!attendance_session_id) {
      return res.status(400).json({ error: 'attendance_session_id là bắt buộc' })
    }

    const sessionAccess = await pool.query(
      `SELECT s.attendance_session_id
       FROM attendance_sessions s
       JOIN classes c ON c.class_id = s.class_id
       WHERE s.attendance_session_id = $1
       AND ($2::boolean = true OR ($3::boolean = true AND c.teacher_id = $4))`,
      [attendance_session_id, isAdmin, isTeacher, req.user.user_id]
    )

    if (sessionAccess.rows.length === 0) {
      return res.status(403).json({ error: 'Bạn không có quyền đóng buổi điểm danh này' })
    }

    const result = await pool.query(
      `UPDATE attendance_sessions
       SET status = 'closed'
       WHERE attendance_session_id = $1 AND status = 'open'
       RETURNING *`,
      [attendance_session_id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy buổi hoặc buổi chưa mở' })
    }

    await writeAuditLog({
      userId: req.user?.user_id,
      actionName: 'attendance.session.close',
      actionData: {
        attendance_session_id
      }
    })

    return res.json({
      message: 'Đóng buổi điểm danh thành công',
      session: result.rows[0]
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

const getSessionList = async (req, res) => {
  try {
    const { class_id, status, q, date_from, date_to, page = 1, limit = 10 } = req.query
    const offset = (page - 1) * limit
    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    let whereClause = 'WHERE 1=1'
    const params = []

    if (!isAdmin && isTeacher) {
      whereClause += ` AND c.teacher_id = $${params.length + 1}`
      params.push(req.user.user_id)
    } else if (!isAdmin && !isTeacher && req.user.class_id) {
      whereClause += ` AND s.class_id = $${params.length + 1}`
      params.push(req.user.class_id)
    }

    if (class_id) {
      whereClause += ` AND s.class_id = $${params.length + 1}`
      params.push(class_id)
    }

    if (status) {
      whereClause += ` AND s.status = $${params.length + 1}`
      params.push(status)
    }

    if (q) {
      whereClause += ` AND c.class_name ILIKE $${params.length + 1}`
      params.push(`%${q}%`)
    }

    if (date_from) {
      whereClause += ` AND s.session_date >= $${params.length + 1}`
      params.push(date_from)
    }

    if (date_to) {
      whereClause += ` AND s.session_date <= $${params.length + 1}`
      params.push(date_to)
    }

    const query = `
      SELECT s.*, c.class_name,
             count(*) OVER() AS total_count
      FROM attendance_sessions s
      JOIN classes c ON c.class_id = s.class_id
      ${whereClause}
      ORDER BY s.session_date DESC, s.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `
    params.push(limit, offset)

    const result = await pool.query(query, params)
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0

    return res.json({
      sessions: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

const getSessionDetails = async (req, res) => {
  try {
    const { attendance_session_id } = req.params

    const sessionResult = await pool.query(`SELECT * FROM attendance_sessions WHERE attendance_session_id = $1`, [
      attendance_session_id
    ])

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy buổi điểm danh' })
    }

    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    if (!isAdmin && isTeacher) {
      const classAccess = await pool.query(
        'SELECT class_id FROM classes WHERE class_id = $1 AND teacher_id = $2 LIMIT 1',
        [sessionResult.rows[0].class_id, req.user.user_id]
      )
      if (classAccess.rows.length === 0) {
        return res.status(403).json({ error: 'Bạn không có quyền xem buổi điểm danh này' })
      }
    }

    const recordsResult = await pool.query(
      `SELECT 
        ar.attendance_id, ar.attendance_session_id, ar.user_id, ar.check_in_time, ar.attendance_status,
        u.user_code, u.full_name, u.email,
        al.captured_image_url
       FROM attendance_records ar
       JOIN users u ON ar.user_id = u.user_id
       LEFT JOIN attendance_logs al ON ar.attendance_id = al.attendance_id
       WHERE ar.attendance_session_id = $1
       ORDER BY ar.check_in_time DESC`,
      [attendance_session_id]
    )

    return res.json({
      session: sessionResult.rows[0],
      records: recordsResult.rows,
      total_records: recordsResult.rows.length
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

// ===== QUÉT MẶT ĐIỂM DANH =====

const scanAttendance = async (req, res) => {
  try {
    const currentUserId = req.user.user_id
    const classId = req.user.class_id
    const { imageBase64, captured_image_url, attendance_session_id } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 là bắt buộc' })
    }

    const matches = await searchByImage({
      imageBase64,
      maxFaces: 1,
      faceMatchThreshold: DEFAULT_MATCH_THRESHOLD
    })

    if (!matches.length) {
      await pool.query(
        `INSERT INTO face_verification_logs
         (user_id, captured_image_url, matched_face_aws_id, similarity_score, verification_status)
         VALUES ($1, $2, $3, $4, $5)`,
        [currentUserId, captured_image_url || null, null, 0, 'failed']
      )

      return res.status(400).json({
        success: false,
        message: 'Không xác thực được khuôn mặt để điểm danh'
      })
    }

    const bestMatch = matches[0]
    const matchedUserId = await resolveMatchedUserId(bestMatch)
    const similarity = Number(bestMatch.Similarity || 0)

    if (!matchedUserId || matchedUserId !== currentUserId) {
      await pool.query(
        `INSERT INTO face_verification_logs
         (user_id, captured_image_url, matched_face_aws_id, similarity_score, verification_status)
         VALUES ($1, $2, $3, $4, $5)`,
        [currentUserId, captured_image_url || null, bestMatch?.Face?.FaceId || null, similarity, 'failed']
      )

      return res.status(403).json({
        success: false,
        message: 'Khuôn mặt không khớp tài khoản đăng nhập hoặc chưa đăng ký',
        similarity
      })
    }

    await pool.query(
      `INSERT INTO face_verification_logs
       (user_id, captured_image_url, matched_face_aws_id, similarity_score, verification_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [currentUserId, captured_image_url || null, bestMatch?.Face?.FaceId || null, similarity, 'success']
    )

    let sessionResult
    if (attendance_session_id) {
      sessionResult = await pool.query(
        `SELECT attendance_session_id, class_id, status
         FROM attendance_sessions
         WHERE attendance_session_id = $1`,
        [attendance_session_id]
      )
    } else if (classId) {
      sessionResult = await pool.query(
        `SELECT attendance_session_id, class_id, status
         FROM attendance_sessions
         WHERE class_id = $1 AND status = 'open'
         ORDER BY created_at DESC
         LIMIT 1`,
        [classId]
      )
    } else {
      return res.status(400).json({
        success: false,
        message: 'Không có class_id trong token, cần truyền attendance_session_id'
      })
    }

    if (!sessionResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy buổi điểm danh đang mở'
      })
    }

    const session = sessionResult.rows[0]

    // Kiểm tra xem học sinh có thuộc lớp của buổi điểm danh này không
    if (!req.user.roles?.includes('admin') && !req.user.roles?.includes('teacher')) {
      if (session.class_id !== req.user.class_id) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không thuộc lớp học của buổi điểm danh này'
        })
      }
    }

    if (session.status !== 'open') {
      return res.status(400).json({
        success: false,
        message: 'Buổi điểm danh đã đóng'
      })
    }

    const existingAttendance = await pool.query(
      `SELECT attendance_id, check_in_time
       FROM attendance_records
       WHERE attendance_session_id = $1 AND user_id = $2
       LIMIT 1`,
      [session.attendance_session_id, currentUserId]
    )

    if (existingAttendance.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Bạn đã điểm danh thành công trong buổi này rồi',
        attendance: existingAttendance.rows[0]
      })
    }

    const attendanceResult = await pool.query(
      `INSERT INTO attendance_records (attendance_session_id, user_id, check_in_time, attendance_status)
       VALUES ($1, $2, NOW(), 'present')
       RETURNING *`,
      [session.attendance_session_id, currentUserId]
    )

    const attendance = attendanceResult.rows[0]

    await pool.query('INSERT INTO attendance_logs (attendance_id, captured_image_url) VALUES ($1, $2)', [
      attendance.attendance_id,
      captured_image_url || null
    ])

    await writeAuditLog({
      userId: currentUserId,
      actionName: 'attendance.scan.success',
      actionData: {
        attendance_id: attendance.attendance_id,
        attendance_session_id: session.attendance_session_id,
        similarity,
        captured_image_url: captured_image_url || null
      }
    })

    return res.json({
      success: true,
      message: 'Điểm danh thành công',
      attendance,
      verification: {
        similarity,
        matched_user_id: matchedUserId
      }
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

const getAttendanceLogs = async (req, res) => {
  try {
    const { attendance_session_id, q, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit
    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    let whereClause = 'WHERE 1=1'
    const params = []

    if (!isAdmin && isTeacher) {
      whereClause += ` AND c.teacher_id = $${params.length + 1}`
      params.push(req.user.user_id)
    }

    if (attendance_session_id) {
      whereClause += ` AND ar.attendance_session_id = $${params.length + 1}`
      params.push(Number(attendance_session_id))
    }

    if (q) {
      whereClause += ` AND (u.full_name ILIKE $${params.length + 1} OR u.user_code ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1})`
      params.push(`%${q}%`)
    }

    const query = `
      SELECT 
        al.*, 
        ar.check_in_time, ar.attendance_status,
        s.session_date,
        c.class_name,
        u.full_name, u.user_code, u.email,
        count(*) OVER() AS total_count
      FROM attendance_logs al
      JOIN attendance_records ar ON ar.attendance_id = al.attendance_id
      JOIN attendance_sessions s ON s.attendance_session_id = ar.attendance_session_id
      JOIN classes c ON c.class_id = s.class_id
      JOIN users u ON u.user_id = ar.user_id
      ${whereClause}
      ORDER BY al.log_time DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `
    params.push(limit, offset)

    const result = await pool.query(query, params)
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0

    return res.json({
      logs: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

const deleteSession = async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    const sessionAccess = await pool.query(
      `SELECT s.attendance_session_id
       FROM attendance_sessions s
       JOIN classes c ON c.class_id = s.class_id
       WHERE s.attendance_session_id = $1
       AND ($2::boolean = true OR ($3::boolean = true AND c.teacher_id = $4))`,
      [id, isAdmin, isTeacher, req.user.user_id]
    )

    if (sessionAccess.rows.length === 0) {
      return res.status(403).json({ error: 'Bạn không có quyền xoá buổi điểm danh này' })
    }

    await pool.query('DELETE FROM attendance_sessions WHERE attendance_session_id = $1', [id])
    return res.json({ message: 'Xoá buổi điểm danh thành công' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

const deleteAttendanceRecord = async (req, res) => {
  try {
    const { id } = req.params
    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    // Kiểm tra quyền (phải là giáo viên của lớp đó hoặc admin)
    const recordAccess = await pool.query(
      `SELECT ar.attendance_id
       FROM attendance_records ar
       JOIN attendance_sessions s ON ar.attendance_session_id = s.attendance_session_id
       JOIN classes c ON c.class_id = s.class_id
       WHERE ar.attendance_id = $1
       AND ($2::boolean = true OR ($3::boolean = true AND c.teacher_id = $4))`,
      [id, isAdmin, isTeacher, req.user.user_id]
    )

    if (recordAccess.rows.length === 0) {
      return res.status(403).json({ error: 'Bạn không có quyền xoá bản ghi điểm danh này' })
    }

    await pool.query('DELETE FROM attendance_records WHERE attendance_id = $1', [id])
    return res.json({ message: 'Xoá bản ghi điểm danh thành công' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

const manualAttendance = async (req, res) => {
  try {
    const { attendance_session_id, user_id, attendance_status } = req.body
    const isAdmin = req.user?.roles?.includes('admin')
    const isTeacher = req.user?.roles?.includes('teacher')

    if (!attendance_session_id || !user_id) {
      return res.status(400).json({ error: 'Thiếu thông tin buổi hoặc học sinh' })
    }

    // Kiểm tra quyền
    const sessionAccess = await pool.query(
      `SELECT s.attendance_session_id
       FROM attendance_sessions s
       JOIN classes c ON c.class_id = s.class_id
       WHERE s.attendance_session_id = $1
       AND ($2::boolean = true OR ($3::boolean = true AND c.teacher_id = $4))`,
      [attendance_session_id, isAdmin, isTeacher, req.user.user_id]
    )

    if (sessionAccess.rows.length === 0) {
      return res.status(403).json({ error: 'Bạn không có quyền can thiệp điểm danh buổi này' })
    }

    // Kiểm tra xem đã có bản ghi chưa
    const existing = await pool.query(
      'SELECT attendance_id FROM attendance_records WHERE attendance_session_id = $1 AND user_id = $2',
      [attendance_session_id, user_id]
    )

    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE attendance_records SET attendance_status = $1, check_in_time = NOW() WHERE attendance_id = $2',
        [attendance_status || 'present', existing.rows[0].attendance_id]
      )
      return res.json({ message: 'Cập nhật điểm danh thành công' })
    } else {
      await pool.query(
        'INSERT INTO attendance_records (attendance_session_id, user_id, check_in_time, attendance_status) VALUES ($1, $2, NOW(), $3)',
        [attendance_session_id, user_id, attendance_status || 'present']
      )
      return res.json({ message: 'Đã đánh dấu điểm danh thành công' })
    }
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

module.exports = {
  createSession,
  openSession,
  closeSession,
  getSessionList,
  getSessionDetails,
  scanAttendance,
  getAttendanceLogs,
  deleteSession,
  deleteAttendanceRecord,
  manualAttendance
}
