const express = require('express')
const router = express.Router()
const authController = require('../controllers/auth.controller')
const { requireAuth } = require('../middlewares/auth.middleware')

// Các API không cần đăng nhập
router.post('/register', authController.register)
router.post('/login', authController.login)

// Các API bắt buộc phải có token (gắn middleware requireAuth)
router.get('/me', requireAuth, authController.getMe)

module.exports = router