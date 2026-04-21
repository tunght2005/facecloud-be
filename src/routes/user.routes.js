const express = require('express')
const router = express.Router()
const userController = require('../controllers/user.controller')
const { requireAuth, requireRole } = require('../middlewares/auth.middleware')

// Từ dòng này trở xuống, mọi API đều yêu cầu phải có Token đăng nhập
router.use(requireAuth)

// Tìm user theo email (dùng cho flow thêm học sinh vào lớp)
router.get('/search', requireRole('admin', 'teacher'), userController.searchByEmail)

// Lấy lịch sử điểm danh của student đang đăng nhập
router.get('/my/attendance', userController.getMyAttendanceHistory)

// Các API quản lý user: Bắt buộc user đang đăng nhập phải có role 'admin'
router.post('/', requireRole('admin'), userController.createUser)
router.post('/students', requireRole('admin', 'teacher'), userController.createStudentInClass)
router.get('/', requireRole('admin'), userController.getAllUsers)
router.get('/teachers', requireRole('admin', 'teacher'), userController.getTeachers)
router.get('/:id', requireRole('admin'), userController.getUserById)
router.put('/:id', requireRole('admin'), userController.updateUser)
router.delete('/:id', requireRole('admin'), userController.deleteUser)

module.exports = router
