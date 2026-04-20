const express = require('express')
const router = express.Router()
const classController = require('../controllers/class.controller')
const { requireAuth, requireRole } = require('../middlewares/auth.middleware')
// Lấy danh sách tất cả lớp học
router.get('/', requireAuth, classController.getClasses)

// Tạo lớp học mới
router.post('/', requireAuth, requireRole('admin', 'teacher'), classController.createClass)

// Lấy thông tin 1 lớp học cụ thể
router.get('/:id', requireAuth, requireRole('admin', 'teacher'), classController.getClassById)

// Lấy danh sách học sinh của 1 lớp
router.get('/:id/students', requireAuth, requireRole('admin', 'teacher'), classController.getClassStudents)

module.exports = router
