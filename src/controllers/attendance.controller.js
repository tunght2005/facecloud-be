const { pool } = require('../config/db');

// ==========================================
// 1. CÁC API QUẢN LÝ BUỔI ĐIỂM DANH (SESSION)
// ==========================================

// [POST] /api/attendance/session/start
// [POST] /api/attendance/session/start
const startSession = async (req, res) => {
    try {
        // Lấy thêm start_time và end_time cố định từ Frontend
        const { class_id, session_date, start_time, end_time, created_by } = req.body;

        if (!class_id || !session_date || !start_time || !end_time || !created_by) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc (class_id, session_date, start_time, end_time, created_by)' });
        }

        // Lưu thẳng khung giờ cố định vào DB
        const query = `
            INSERT INTO attendance_sessions (class_id, session_date, start_time, end_time, status, created_by) 
            VALUES ($1, $2, $3, $4, 'open', $5) 
            RETURNING *;
        `;
        const { rows } = await pool.query(query, [class_id, session_date, start_time, end_time, created_by]);

        res.status(201).json({ success: true, message: 'Đã tạo lịch điểm danh cố định', data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};

// [POST] /api/attendance/session/end
const endSession = async (req, res) => {
    try {
        const { session_id } = req.body; 
        
        if (!session_id) {
            return res.status(400).json({ success: false, message: 'Thiếu session_id' });
        }

        const checkQuery = `SELECT status FROM attendance_sessions WHERE attendance_session_id = $1;`;
        const checkRes = await pool.query(checkQuery, [session_id]);

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy buổi điểm danh này' });
        }
        if (checkRes.rows[0].status === 'closed') {
            return res.status(400).json({ success: false, message: 'Buổi điểm danh này đã được đóng từ trước rồi' });
        }

        const updateQuery = `
            UPDATE attendance_sessions 
            SET end_time = CURRENT_TIMESTAMP, status = 'closed' 
            WHERE attendance_session_id = $1 
            RETURNING *;
        `;
        const { rows } = await pool.query(updateQuery, [session_id]);

        res.status(200).json({ success: true, message: 'Đã đóng buổi điểm danh', data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};

// [GET] /api/attendance/class/:classId
const getSessionsByClass = async (req, res) => {
    try {
        const classId = req.params.classId;

        const query = `
            SELECT * FROM attendance_sessions 
            WHERE class_id = $1 
            ORDER BY session_date DESC, start_time DESC;
        `;
        const { rows } = await pool.query(query, [classId]);

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};


// ==========================================
// 2. CÁC API ĐIỂM DANH & LỊCH SỬ (RECORDS)
// ==========================================

// [POST] /api/attendance/check-in
// [POST] /api/attendance/check-in
const checkIn = async (req, res) => {
    try {
        const { session_id, user_id, captured_image_url } = req.body;

        if (!session_id || !user_id) {
            return res.status(400).json({ success: false, message: 'Thiếu session_id hoặc user_id' });
        }

        // 1. Lấy khung giờ cố định của buổi học
        const sessionQuery = `SELECT start_time, end_time, status FROM attendance_sessions WHERE attendance_session_id = $1`;
        const sessionRes = await pool.query(sessionQuery, [session_id]);

        if (sessionRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy buổi học' });
        }
        
        const session = sessionRes.rows[0];

        if (session.status === 'closed') {
            return res.status(400).json({ success: false, message: 'Buổi học này đã bị đóng từ trước' });
        }

        const checkInTime = new Date(); // Lấy giờ hiện tại lúc học sinh quét mặt
        const startTime = new Date(session.start_time);
        const endTime = new Date(session.end_time);

        // 2. Kiểm tra các điều kiện về khung giờ cố định
        if (checkInTime < startTime) {
            return res.status(400).json({ success: false, message: 'Chưa đến giờ điểm danh của ca học này' });
        }

        if (checkInTime > endTime) {
            return res.status(400).json({ success: false, message: 'Đã quá hạn thời gian điểm danh' });
        }

        // 3. Tính trạng thái: <= 15p so với start_time là Present, > 15p là Late
        const diffInMinutes = (checkInTime - startTime) / (1000 * 60);
        const attendanceStatus = diffInMinutes <= 15 ? 'present' : 'late';

        // 4. Lưu vào bảng records
        const recordQuery = `
            INSERT INTO attendance_records (attendance_session_id, user_id, check_in_time, attendance_status)
            VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
            ON CONFLICT (attendance_session_id, user_id) 
            DO UPDATE SET check_in_time = CURRENT_TIMESTAMP, attendance_status = EXCLUDED.attendance_status
            RETURNING attendance_id;
        `;
        const recordRes = await pool.query(recordQuery, [session_id, user_id, attendanceStatus]);
        const attendanceId = recordRes.rows[0].attendance_id;

        // 5. Lưu log ảnh (nếu có)
        if (captured_image_url) {
            const logQuery = `
                INSERT INTO attendance_logs (attendance_id, captured_image_url)
                VALUES ($1, $2)
            `;
            await pool.query(logQuery, [attendanceId, captured_image_url]);
        }

        res.status(200).json({ 
            success: true, 
            message: `Điểm danh thành công (${attendanceStatus})`,
            data: { attendanceId, status: attendanceStatus, check_in_time: checkInTime }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};

// [GET] /api/attendance/user/:userId
const getUserAttendance = async (req, res) => {
    try {
        const { userId } = req.params;

        const query = `
            SELECT 
                ar.attendance_status, ar.check_in_time,
                ase.session_date, ase.start_time,
                c.class_name
            FROM attendance_records ar
            JOIN attendance_sessions ase ON ar.attendance_session_id = ase.attendance_session_id
            JOIN classes c ON ase.class_id = c.class_id
            WHERE ar.user_id = $1
            ORDER BY ase.session_date DESC;
        `;
        const { rows } = await pool.query(query, [userId]);

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};

// [GET] /api/attendance/session/:sessionId/records
// Lấy danh sách điểm danh của 1 buổi học (Kèm ảnh chụp từ log)
const getRecordsBySession = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const query = `
            SELECT 
                ar.attendance_id, 
                u.user_id, u.user_code, u.full_name, 
                ar.attendance_status, ar.check_in_time,
                al.captured_image_url
            FROM attendance_records ar
            JOIN users u ON ar.user_id = u.user_id
            LEFT JOIN attendance_logs al ON ar.attendance_id = al.attendance_id
            WHERE ar.attendance_session_id = $1
            ORDER BY ar.check_in_time DESC;
        `;
        const { rows } = await pool.query(query, [sessionId]);

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};

// [PUT] /api/attendance/record/:recordId
// Giáo viên cập nhật trạng thái điểm danh thủ công (present, late, absent)
const updateAttendanceStatus = async (req, res) => {
    try {
        const { recordId } = req.params;
        const { attendance_status } = req.body;

        if (!['present', 'late', 'absent'].includes(attendance_status)) {
            return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
        }

        const query = `
            UPDATE attendance_records 
            SET attendance_status = $1 
            WHERE attendance_id = $2 
            RETURNING *;
        `;
        const { rows } = await pool.query(query, [attendance_status, recordId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi điểm danh này' });
        }

        res.status(200).json({ success: true, message: 'Cập nhật trạng thái thành công', data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};

// ==========================================
// XUẤT TẤT CẢ CÁ
module.exports = {
    startSession,
    endSession,
    getSessionsByClass,
    checkIn,
    getUserAttendance,
    getRecordsBySession, 
    updateAttendanceStatus
};
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
