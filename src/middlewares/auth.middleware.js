const jwt = require('jsonwebtoken')

// Middleware 1: Kiểm tra xem người dùng đã đăng nhập (có token hợp lệ) chưa
const requireAuth = (req, res, next) => {
  try {
    // Lấy token từ header của request (Định dạng: "Bearer <token>")
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Không tìm thấy token xác thực' })
    }

    // Tách lấy chuỗi token
    const token = authHeader.split(' ')[1]

    // Giải mã token bằng chữ ký bí mật
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Gắn thông tin người dùng (user_id, roles...) vào request để các API sau dùng
    req.user = decoded

    // Chuyển quyền xử lý cho Controller tiếp theo
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Token không hợp lệ hoặc đã hết hạn' })
  }
}

// Middleware 2: Kiểm tra xem người dùng có quyền (role) cụ thể hay không
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    // req.user đã được gán từ middleware requireAuth trước đó
    if (!req.user || !req.user.roles || !req.user.roles.includes(requiredRole)) {
      return res.status(403).json({ error: `Forbidden: API này yêu cầu quyền [${requiredRole}]` })
    }
    next()
  }
}

module.exports = {
  requireAuth,
  requireRole
}