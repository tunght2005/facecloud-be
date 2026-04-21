const express = require('express')
const router = express.Router()
const auditController = require('../controllers/audit.controller')
const { requireAuth, requireRole } = require('../middlewares/auth.middleware')

router.use(requireAuth)
router.get('/logs', requireRole('admin'), auditController.getAuditLogs)

module.exports = router
