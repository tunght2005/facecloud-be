const express = require('express');
const router = express.Router();

// Đảm bảo đường dẫn này trỏ ĐÚNG vào file bạn vừa lưu
const attendanceController = require('../controllers/attendance.controller');

// --- CÁC API VỀ SESSIONS ---
router.post('/session/start', attendanceController.startSession);
router.post('/session/end', attendanceController.endSession);
router.get('/class/:classId', attendanceController.getSessionsByClass);

// --- CÁC API VỀ ĐIỂM DANH (RECORDS) ---
router.post('/check-in', attendanceController.checkIn);
router.get('/user/:userId', attendanceController.getUserAttendance);

router.get('/session/:sessionId/records', attendanceController.getRecordsBySession);
router.put('/record/:recordId', attendanceController.updateAttendanceStatus);

module.exports = router;