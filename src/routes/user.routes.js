const express = require('express')
const router = express.Router()
const userController = require('../controllers/user.controller')
const { requireAuth, requireRole } = require('../middlewares/auth.middleware')


// Từ dòng này trở xuống, mọi API đều yêu cầu phải có Token đăng nhập
router.use(requireAuth)

// Các API quản lý user: Bắt buộc user đang đăng nhập phải có role 'admin'
router.post('/', requireRole('admin'), userController.createUser)
router.get('/', requireRole('admin'), userController.getAllUsers)
router.put('/:id', requireRole('admin'), userController.updateUser)
router.delete('/:id', requireRole('admin'), userController.deleteUser)


module.exports = router