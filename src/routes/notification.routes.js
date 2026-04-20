const express = require('express')
const router = express.Router()
const notificationController = require('../controllers/notification.controller')
const { requireAuth } = require('../middlewares/auth.middleware')

// Yêu cầu đăng nhập mới được xem thông báo
router.use(requireAuth)

router.get('/', notificationController.getMyNotifications)
router.put('/:id/read', notificationController.markAsRead)

module.exports = router