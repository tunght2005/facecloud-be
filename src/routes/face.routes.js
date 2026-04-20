const express = require('express')
const router = express.Router()
const faceController = require('../controllers/face.controller')
const { requireAuth } = require('../middlewares/auth.middleware')

router.use(requireAuth)
router.post('/register', faceController.registerFace)
router.post('/verify', faceController.verifyFace)

module.exports = router
