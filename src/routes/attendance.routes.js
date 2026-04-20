const express = require('express')
const router = express.Router()
const attendanceController = require('../controllers/attendance.controller')
const { requireAuth } = require('../middlewares/auth.middleware')

router.use(requireAuth)
router.post('/scan', attendanceController.scanAttendance)

module.exports = router
