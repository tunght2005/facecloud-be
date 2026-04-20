const express = require('express')
const router = express.Router()
const attendanceController = require('../controllers/attendance.controller')
const { requireAuth } = require('../middlewares/auth.middleware')

router.use(requireAuth)

// ===== QUẢN LÝ BUỔI ĐIỂM DANH (SESSION) =====

// Tạo buổi điểm danh mới
router.post('/session/create', attendanceController.createSession)

// Mở buổi điểm danh (bắt đầu quét mặt)
router.post('/session/open', attendanceController.openSession)

// Đóng buổi điểm danh
router.post('/session/close', attendanceController.closeSession)

// Lấy danh sách buổi điểm danh
router.get('/session/list', attendanceController.getSessionList)

// Lấy chi tiết buổi điểm danh (kèm danh sách điểm danh)
router.get('/session/:attendance_session_id', attendanceController.getSessionDetails)

// ===== QUÉT MẶT ĐIỂM DANH =====

// Quét mặt để điểm danh
router.post('/scan', attendanceController.scanAttendance)

module.exports = router
