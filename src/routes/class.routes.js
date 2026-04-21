const express = require('express')
const router = express.Router()
const classController = require('../controllers/class.controller')
const { requireAuth, requireRole } = require('../middlewares/auth.middleware')
// Lấy danh sách tất cả lớp học
router.get('/', requireAuth, classController.getClasses)

// Tạo lớp học mới
router.post('/', requireAuth, requireRole('admin', 'teacher'), classController.createClass)

// Cập nhật lớp học
router.put('/:id', requireAuth, requireRole('admin', 'teacher'), classController.updateClass)

// Xóa lớp học
router.delete('/:id', requireAuth, requireRole('admin', 'teacher'), classController.deleteClass)

// Lấy thông tin 1 lớp học cụ thể
router.get('/:id', requireAuth, requireRole('admin', 'teacher'), classController.getClassById)

// Lấy danh sách học sinh của 1 lớp
router.get('/:id/students', requireAuth, requireRole('admin', 'teacher'), classController.getClassStudents)

// Thêm học sinh vào lớp (admin/teacher)
router.put('/:id/students', requireAuth, requireRole('admin', 'teacher'), classController.assignStudentsToClass)

module.exports = router
