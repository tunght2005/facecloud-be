const express = require('express')
const router = express.Router()
const attendanceController = require('../controllers/attendance.controller')
const { requireAuth, requireRole } = require('../middlewares/auth.middleware')

router.use(requireAuth)

// ===== QUẢN LÝ BUỔI ĐIỂM DANH (SESSION) =====

// Tạo buổi điểm danh mới
router.post('/session/create', requireRole('admin', 'teacher'), attendanceController.createSession)

// Mở buổi điểm danh (bắt đầu quét mặt)
router.post('/session/open', requireRole('admin', 'teacher'), attendanceController.openSession)

// Đóng buổi điểm danh
router.post('/session/close', requireRole('admin', 'teacher'), attendanceController.closeSession)

// Lấy danh sách buổi điểm danh (Cho phép cả student để họ chọn buổi điểm danh)
router.get('/session/list', attendanceController.getSessionList)

// Lấy chi tiết buổi điểm danh (kèm danh sách điểm danh)
router.get('/session/:attendance_session_id', requireRole('admin', 'teacher'), attendanceController.getSessionDetails)

// Lấy logs ảnh điểm danh
router.get('/logs', requireRole('admin', 'teacher'), attendanceController.getAttendanceLogs)

// ===== QUÉT MẶT ĐIỂM DANH =====

// Quét mặt để điểm danh
router.post('/scan', attendanceController.scanAttendance)

// Xoá buổi điểm danh
router.delete('/session/:id', requireRole('admin', 'teacher'), attendanceController.deleteSession)

// Xoá bản ghi điểm danh
router.delete('/record/:id', requireRole('admin', 'teacher'), attendanceController.deleteAttendanceRecord)

// Can thiệp điểm danh thủ công
router.post('/manual', requireRole('admin', 'teacher'), attendanceController.manualAttendance)

module.exports = router
