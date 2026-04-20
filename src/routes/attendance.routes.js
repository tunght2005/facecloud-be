const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth.middleware')
// Đảm bảo đường dẫn này trỏ ĐÚNG vào file bạn vừa lưu
const attendanceController = require('../controllers/attendance.controller');

// --- CÁC API VỀ SESSIONS ---
router.post('/session/start', requireAuth,requireRole('admin', 'teacher'),attendanceController.startSession);
router.post('/session/end', requireAuth,requireRole('admin', 'teacher'),attendanceController.endSession);
router.get('/class/:classId', requireAuth,requireRole('admin', 'teacher'),attendanceController.getSessionsByClass);

// --- CÁC API VỀ ĐIỂM DANH (RECORDS) ---
router.post('/check-in', requireAuth,requireRole('admin', 'teacher'),attendanceController.checkIn);
router.get('/user/:userId', requireAuth,requireRole('admin', 'teacher'),attendanceController.getUserAttendance);

router.get('/session/:sessionId/records', requireAuth,requireRole('admin', 'teacher'),attendanceController.getRecordsBySession);
router.put('/record/:recordId', requireAuth,requireRole('admin', 'teacher'),attendanceController.updateAttendanceStatus);

module.exports = router;
const express = require('express')
const router = express.Router()
const attendanceController = require('../controllers/attendance.controller')
const { requireAuth } = require('../middlewares/auth.middleware')

router.use(requireAuth)
router.post('/scan', attendanceController.scanAttendance)

module.exports = router
