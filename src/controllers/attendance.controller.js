const { pool } = require('../config/db')
const { searchByImage } = require('../services/rekognition.service')
const { resolveMatchedUserId } = require('./face.controller')

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

    const classResult = await pool.query('SELECT class_id FROM classes WHERE class_id = $1 LIMIT 1', [class_id])
    if (classResult.rows.length === 0) {
      return res.status(400).json({ error: `class_id ${class_id} không tồn tại trong bảng classes` })
    }

    const result = await pool.query(
      `INSERT INTO attendance_sessions (class_id, session_date, start_time, end_time, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, 'planning', $5, NOW())
       RETURNING *`,
      [class_id, session_date, startTimestamp, endTimestamp, created_by]
    )

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

    if (!attendance_session_id) {
      return res.status(400).json({ error: 'attendance_session_id là bắt buộc' })
    }

    const result = await pool.query(
      `UPDATE attendance_sessions 
       SET status = 'open', updated_at = NOW() 
       WHERE attendance_session_id = $1 AND status IN ('planning', 'closed')
       RETURNING *`,
      [attendance_session_id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy buổi điểm danh hoặc buổi đã mở' })
    }

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

    if (!attendance_session_id) {
      return res.status(400).json({ error: 'attendance_session_id là bắt buộc' })
    }

    const result = await pool.query(
      `UPDATE attendance_sessions 
       SET status = 'closed', updated_at = NOW() 
       WHERE attendance_session_id = $1 AND status = 'open'
       RETURNING *`,
      [attendance_session_id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy buổi hoặc buổi chưa mở' })
    }

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
    const { class_id, status } = req.query

    let query = `SELECT * FROM attendance_sessions WHERE 1=1`
    const params = []

    if (class_id) {
      query += ` AND class_id = $${params.length + 1}`
      params.push(class_id)
    }

    if (status) {
      query += ` AND status = $${params.length + 1}`
      params.push(status)
    }

    query += ` ORDER BY session_date DESC, created_at DESC`

    const result = await pool.query(query, params)
    return res.json({
      sessions: result.rows,
      total: result.rows.length
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

      return res.status(401).json({
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
        message: 'Khuôn mặt không khớp tài khoản đăng nhập'
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
    if (session.status !== 'open') {
      return res.status(400).json({
        success: false,
        message: 'Buổi điểm danh đã đóng'
      })
    }

    const attendanceResult = await pool.query(
      `INSERT INTO attendance_records (attendance_session_id, user_id, check_in_time, attendance_status)
       VALUES ($1, $2, NOW(), 'present')
       ON CONFLICT (attendance_session_id, user_id)
       DO UPDATE SET check_in_time = EXCLUDED.check_in_time, attendance_status = 'present'
       RETURNING *`,
      [session.attendance_session_id, currentUserId]
    )

    const attendance = attendanceResult.rows[0]

    await pool.query('INSERT INTO attendance_logs (attendance_id, captured_image_url) VALUES ($1, $2)', [
      attendance.attendance_id,
      captured_image_url || null
    ])

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

module.exports = {
  createSession,
  openSession,
  closeSession,
  getSessionList,
  getSessionDetails,
  scanAttendance
}
