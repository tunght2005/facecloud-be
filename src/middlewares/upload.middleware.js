const fs = require('fs')
const path = require('path')
const multer = require('multer')

const uploadsRoot = path.join(__dirname, '../../uploads')

const ensureDir = (targetDir) => {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.query.type === 'captured' ? 'captured' : 'face'
    const targetDir = path.join(uploadsRoot, type)
    ensureDir(targetDir)
    cb(null, targetDir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg'
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`)
  }
})

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Chỉ cho phép upload ảnh'))
    }
    cb(null, true)
  }
})

module.exports = {
  upload
}
