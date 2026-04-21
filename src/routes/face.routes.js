const express = require('express')
const router = express.Router()
const faceController = require('../controllers/face.controller')
const { requireAuth } = require('../middlewares/auth.middleware')
const { upload } = require('../middlewares/upload.middleware')

router.use(requireAuth)

// Lấy khuôn mặt đã đăng ký của user
router.get('/profile', faceController.getFaceProfile)
router.get('/profile/:user_id', faceController.getFaceProfile)

// Đăng ký khuôn mặt
router.post('/register', faceController.registerFace)

// Upload ảnh khuôn mặt/captured image
router.post('/upload', upload.single('image'), faceController.uploadFaceImage)

// Xác thực khuôn mặt (kiểm tra khuôn mặt có trong collection không)
router.post('/verify', faceController.verifyFace)

// So sánh chi tiết khuôn mặt với ảnh đã đăng ký
router.post('/compare', faceController.compareFace)
router.post('/compare/:user_id', faceController.compareFace)

// Lấy lịch sử verification
router.get('/history', faceController.getFaceVerificationHistory)
router.get('/history/:user_id', faceController.getFaceVerificationHistory)

// Quản lý quyền cập nhật khuôn mặt (Admin/Teacher)
const { requireRole } = require('../middlewares/auth.middleware')
router.get('/permissions', requireRole('admin', 'teacher'), faceController.getUsersFaceStatus)
router.post('/permissions/toggle', requireRole('admin', 'teacher'), faceController.toggleFaceUpdatePermission)

module.exports = router
