const { pool } = require('../config/db')
const { searchByImage } = require('../services/rekognition.service')
const { resolveMatchedUserId } = require('./face.controller')

const DEFAULT_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 85)

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
  scanAttendance
}
